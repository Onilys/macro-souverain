# desktop-cef

Status: experimental; not built by CI or the release pipeline yet.

## What it is

The macOS desktop app rendered with Chromium (CEF) instead of WKWebView. It is a
thin binary over `../src-tauri` (`app_lib::run_with`) that selects
`tauri-runtime-cef`.

## Scope

- Owns: the macOS Chromium binary, its Cargo workspace and lockfile, and its
  bundle config (`tauri.conf.json`).
- Not here: app behaviour, which stays in `../src-tauri`; iOS, Android, Linux,
  and Windows, which build `../src-tauri` from `../Cargo.toml` on wry.

## Checks

- `RUSTUP_TOOLCHAIN=1.95.0 cargo check --target aarch64-apple-darwin`
- Bundle: build the frontend inside `nix develop` (`just build-tauri` in
  `apps/web`), then from here run the Tauri CLI built from the `macro-cef`
  branch of `macro-inc/tauri`:
  `RUSTUP_TOOLCHAIN=1.95.0 cargo-tauri build --bundles app -c '{"build":{"beforeBuildCommand":""}}'`.
  The stock `cargo-tauri` does not ship the Chromium framework or helper apps.

## Gotchas

- Keep this a separate workspace. A `[patch]` applies to every target in its
  workspace, so moving the CEF Tauri patches into `../Cargo.toml` would rebuild
  iOS and Android against the CEF branch.
- `../src-tauri` must resolve `tauri` through `[patch.crates-io]` (a version
  requirement, not a git dependency) so this workspace can repoint it.
- The `cef` feature of `../src-tauri` adds no dependencies; it switches the
  served origin to `http://tauri.localhost` and the `AppRuntime` alias to
  `tauri::DynRuntime`. It only compiles in this workspace.
- Needs Rust 1.95 (the repo pins 1.94), `cmake`, and `ninja`; the first build
  downloads about 1 GB of CEF into `~/Library/Caches/tauri-cef`.
- Keep `tauri.conf.json` aligned with `../src-tauri/tauri.conf.json` and
  `tauri.macos.conf.json`: the CLI bundles from this file, while the app's
  runtime config still comes from `../src-tauri`.
