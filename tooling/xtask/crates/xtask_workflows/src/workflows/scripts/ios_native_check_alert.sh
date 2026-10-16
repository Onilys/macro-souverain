set -euo pipefail
# Post the gate's failure to the Macro channel behind $MACRO_WEBHOOK_URL.
# Fork PRs never receive repository secrets, so an empty token is the normal
# case there rather than a misconfiguration.
if [[ -z "${MACRO_BOT_TOKEN:-}" || -z "${MACRO_WEBHOOK_URL:-}" ]]; then
  echo "::notice::MACRO_IOS_CI_ALERT_TOKEN/MACRO_IOS_CI_ALERT_WEBHOOK_URL are unavailable (fork PR, or the secrets are unset); skipping the alert."
  exit 0
fi
# Every field arrives through the environment and is escaped by jq, so a PR
# title containing quotes, newlines or shell metacharacters stays data.
message="❌ iOS Native Check failed on ${PR_URL} (#${PR_NUMBER} \"${PR_TITLE}\") by @${PR_AUTHOR} — branch ${PR_BRANCH} — run: ${RUN_URL}"
# A webhook that accepts the connection but never answers would otherwise hold
# the runner until the job timeout, so bound both one attempt and the retries.
# The retries can duplicate a message whose response was lost — the handler
# posts with no nonce, so nothing dedupes it — which is the right trade for an
# alert whose whole point is that a silent failure goes unnoticed.
jq -n --arg content "$message" '{content: $content}' |
  curl --fail-with-body --silent --show-error --output /dev/null \
    --max-time 30 --retry 3 --retry-max-time 90 \
    --header 'Content-Type: application/json' \
    --header "x-macro-bot-token: $MACRO_BOT_TOKEN" \
    --header 'x-macro-bot-scope: user' \
    --data-binary @- "$MACRO_WEBHOOK_URL"
echo "Posted the iOS Native Check failure for PR #${PR_NUMBER} to the Macro channel."
