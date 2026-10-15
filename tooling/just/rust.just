import './database.just'

mod sqlx './sqlx.just'

rust-check:
    RUSTFLAGS=-Dwarnings RUSTDOCFLAGS=-Dwarnings CARGO_TERM_COLOR=always SQLX_OFFLINE=true cargo check --workspace --all-features --exclude sync_service
    RUSTFLAGS="-Dwarnings -Dclippy::disallowed_methods" RUSTDOCFLAGS=-Dwarnings CARGO_TERM_COLOR=always SQLX_OFFLINE=true cargo check -p sync_service

ci_scripts := justfile_directory() / "tooling/xtask/crates/xtask_workflows/src/workflows/scripts"
# CI's Rust jobs build with exactly this; see `RUSTFLAGS` in xtask_workflows' vars.rs.
ci_rustflags := "-C link-arg=-fuse-ld=mold"

# Lint the whole workspace with CI's own script and flags, so what this compiles
# is a kache hit for the CI check job.
clippy:
    RUSTFLAGS="{{ ci_rustflags }}" RUSTDOCFLAGS=-Dwarnings CARGO_TERM_COLOR=always SQLX_OFFLINE=true \
        RUST_PACKAGES=all bash {{ ci_scripts }}/cargo_clippy.sh

# Compile what CI's check and test jobs will compile for this branch, with CI's
# package selection, flags and scripts, so kache publishes it to the shared
# remote before you push. CI compiles your branch merged into its base, so
# this only matches when the branch already contains origin/<base>.
ci-prebuild base="main":
    #!/usr/bin/env bash
    set -euo pipefail
    if [ "$(uname -sm)" != "Linux x86_64" ]; then
        echo "CI runs on Linux x86_64; builds from $(uname -sm) never match its cache keys" >&2
        exit 1
    fi
    git fetch --quiet --no-tags origin {{ base }}
    if ! git merge-base --is-ancestor origin/{{ base }} HEAD; then
        echo "warning: this branch does not contain origin/{{ base }}; rebase first or CI compiles a different tree" >&2
    fi
    outputs="$(mktemp)"
    trap 'rm -f "$outputs"' EXIT
    GITHUB_BASE_REF={{ base }} GITHUB_SHA="$(git rev-parse HEAD)" bash {{ ci_scripts }}/compute_changed_files.sh
    GITHUB_OUTPUT="$outputs" FILTER_CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/macro-nextest-filter" \
        bash {{ ci_scripts }}/compute_nextest_filter.sh
    packages="$(sed -n 's/^rust_packages=//p' "$outputs")"
    skip_tests="$(sed -n 's/^skip_tests=//p' "$outputs")"
    export RUSTFLAGS="{{ ci_rustflags }}" CARGO_TERM_COLOR=always
    RUSTDOCFLAGS=-Dwarnings SQLX_OFFLINE=true RUST_PACKAGES="$packages" bash {{ ci_scripts }}/cargo_clippy.sh
    if [ "$packages" != none ] && [ "$skip_tests" != true ]; then
        # Like CI's test job, compile the test-only queries against a migrated
        # Postgres: they are not in the offline .sqlx cache. The URL is not
        # part of any kache key.
        db="$(docker run -d --rm -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password \
            -e POSTGRES_DB=macrodb -p 127.0.0.1::5432 pgvector/pgvector:pg14)"
        trap 'rm -f "$outputs"; docker rm -f "$db" >/dev/null' EXIT
        until docker exec "$db" pg_isready -q -h 127.0.0.1 -U user -d macrodb; do sleep 1; done
        port="$(docker port "$db" 5432/tcp | head -1 | sed 's/.*://')"
        export DATABASE_URL="postgres://user:password@127.0.0.1:$port/macrodb"
        sqlx migrate run --source crates/macro_db_client/migrations
        RUST_PACKAGES="$packages" NEXTEST_NO_RUN=1 NEXTEST_TEST_THREADS=1 \
            bash {{ ci_scripts }}/run_tests.sh
    fi
    queue="${KACHE_CACHE_DIR:-$HOME/macro-kache}/upload-queue"
    while [ -n "$(ls -A "$queue" 2>/dev/null)" ]; do
        echo "waiting for kache to upload $(ls "$queue" | wc -l) entries"
        sleep 5
    done
    echo "kache has published this branch's build; push when ready"

# This can be used in any crate that uses macrodb under the hood
[no-cd]
prepare_db:
    just sqlx::prepare_db {{ DATABASE_URL }}

format:
    SQLX_OFFLINE=true cargo fmt

# Regenerate dependency-unification metadata after changing any Cargo.toml:
# the workspace-hack crate (feature unification, see .config/hakari.toml) and
# the per-artifact dep closure map consumed by the flake's deploy builds.
# Runs the lock-pinned generator in tooling/xtask/, so local runs always match CI.
# CI fails if either artifact is stale.
hakari:
    cargo run -p xtask -- deps

clean:
    cargo clean
    git restore target/lambda

build:
    SQLX_OFFLINE=true cargo build

# Build dev service Docker images to pre-warm the cache used by root `run_local`.
build_dev_service_images:
  docker build -f docker/Dockerfile.dev --target services_bundle -t macro-local-rust-services:dev .
  docker build -f docker/Dockerfile.search_processing_service.dev --target search_processing_service -t macro-local-search-processing-service:dev .

# Build all lambda functions
build_lambdas compiler="":
    ulimit -n 10240 && just services/docx_unzip_handler/build {{compiler}}
    ulimit -n 10240 && just services/call_recording_preview_handler/build {{compiler}}
    ulimit -n 10240 && just services/delete_chat_handler/build {{compiler}}
    ulimit -n 10240 && just services/organization_retention_handler/build {{compiler}}
    ulimit -n 10240 && just services/organization_retention_trigger/build {{compiler}}
    ulimit -n 10240 && just services/upload_extractor_lambda_trigger/build {{compiler}}
    ulimit -n 10240 && just services/upload_extractor_lambda_handler/build {{compiler}}
    ulimit -n 10240 && just services/worker_trigger/build {{compiler}}
    ulimit -n 10240 && just services/dataloss_prevention_handler/build {{compiler}}
    ulimit -n 10240 && just services/search_upload_handler/build {{compiler}}
    ulimit -n 10240 && just services/document_text_extractor/build {{compiler}}
    ulimit -n 10240 && just services/document_upload_finalizer_handler/build {{compiler}}
    ulimit -n 10240 && just services/email_suppression_handler/build {{compiler}}
    ulimit -n 10240 && just services/deleted_item_poller/build {{compiler}}
    ulimit -n 10240 && just services/email_refresh_handler/build {{compiler}}
    ulimit -n 10240 && just services/user_link_cleanup_handler/build {{compiler}}
    ulimit -n 10240 && just services/notification_retention_handler/build {{compiler}}
    ulimit -n 10240 && just services/email_scheduled_handler/build {{compiler}}
    ulimit -n 10240 && just services/email_sfs_delete_handler/build {{compiler}}
    ulimit -n 10240 && just services/image_optimizer/build {{compiler}}
    ulimit -n 10240 && just services/ai_projections_refresh_handler/build {{compiler}}

# TESTING

# Copies over necessary .env files for sqlx tests
setup_test_envs:
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/contacts/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./services/delete_chat_handler/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./services/email_sfs_delete_handler/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./services/scheduled_action/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/notification_db_client/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/notification/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/macro_db_client/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/email_db_client/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./services/email_refresh_handler/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/comms_db_client/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./services/document_cognition_service/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./services/document_text_extractor/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./services/organization_retention_handler/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./services/organization_retention_trigger/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./services/organization_retention_handler/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./services/sha_cleanup_worker/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/roles_and_permissions/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/teams/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/frecency/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/favorites/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/reminders/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/slack_integration/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./services/slack_import_worker/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/user_api_key/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/soup/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/email/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/system_properties/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/properties/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/name_search/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./services/email_scheduled_handler/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/saved_views/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/channels/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/documents/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/projects/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/foreign_entity/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/stream/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/entity_access/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/github/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/initiative/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/referral/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/chat/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/memory/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/ai_usage/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/call/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/entity_access_management/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/mobile_welcome_email_db_client/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/entity_access_db_utils/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/entity_registry/entity_registry/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/entity_registry/entity_registry_db_utils/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/mcp_client/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./services/document_storage_service/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/task_dedup/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/crm/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/bots/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./services/call_recording_preview_handler/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/share_permission_db_utils/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/ai_projections/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./services/ai_projections_refresh_handler/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/ai_billing/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/webhook/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./crates/calendar_events/.env
    echo "DATABASE_URL={{ DATABASE_URL }}" >> ./services/email_service/.env

setup_macrodb:
    just crates/macro_db_client/create_db
    just crates/macro_db_client/migrate_db

initialize_dbs: setup_macrodb

# Migrate template1 so each `#[sqlx::test]` database starts with the macrodb schema:
# Postgres clones template1 for every CREATE DATABASE, which leaves the test migrator
# nothing to apply. Every database created on this server afterwards gets the schema
# too, so only run it against a Postgres dedicated to one checkout, such as CI's.
setup_test_template:
    cd crates/macro_db_client && sqlx migrate run --database-url {{ replace(DATABASE_URL, "/macrodb", "/template1") }}
