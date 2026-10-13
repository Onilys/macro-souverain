# Web tooling

This migration is scoped to `apps/web`. Shared packages, marketing, and infra
retain their existing compiler and formatting policies.

## Commands

Run these commands from `apps/web`:

| Command | Purpose |
| --- | --- |
| `bun run check` | Schema checks, native TypeScript, formatting, import organization, and lint |
| `bun run type-check` | Native TypeScript 7.0.2 checks for the app and migration scripts |
| `bun run type-check:legacy` | Explicit TypeScript 5.9.3 comparison |
| `bun run format` / `format:check` | Oxfmt write/check, with the former Biome file scope |
| `bun run imports:fix` / `imports:check` | Biome import/export organization, without formatting or lint |
| `bun run lint` | Oxlint plus the existing Biome lint compatibility gate |
| `bun run fix` | Existing safe import/lint fixes, then Oxfmt |
| `bun run fix:oxlint` | Explicit opt-in fixes for advisory Oxlint findings |
| `bun run lint:ci` / `lint:staged` | Changed/staged web files only; no changes to other packages |
| `bun run cycles` | Knip runtime-cycle warnings |
| `bun run cycles:biome` | Original Biome cycle policy |

Root package scripts and `just check` delegate web files to these tools. The
shared-file part of `just check` still uses Biome and the original supplemental
Oxlint rules. CI uses the same web commands and keeps its existing job IDs.

## Two TypeScript versions

The workspace's default `tsc` and `import ts from 'typescript'` stay on 5.9.3.
The UI audit and shared compiler-API consumers therefore keep working.
Collaboration retains main's native TypeScript check through the same isolated
`tsgo` wrapper, without an npm alias replacing the legacy `tsc` binary.

The private `tooling/typescript-native` workspace depends on TypeScript 7.0.2 and
exposes `tsgo`. Web scripts resolve its launcher explicitly, independent of
working directory and hoisting. An npm alias was rejected because Bun linked
its `tsc` over the workspace's legacy binary. The wrapper checks its compiler
version and passes through arguments, input/output, and exit status.

Native e2e compiler commands remain explicitly on 5.9 until their separate
configuration/type-check differences are addressed. Editor language servers
remain a separate choice: do not point `vtsls` or `typescript-language-server`
at TypeScript 7, which does not ship their expected `tsserver.js`.

## Compatibility gates

Oxfmt is the formatter. Import sorting is deliberately not enabled there:
Biome still owns natural import ordering, specifier merging, and export
organization. Generated-client exclusions and the animation formatter opt-out
are preserved. Code generators finish with Oxfmt, not Biome formatting.

Oxlint owns the existing promise/complexity checks and adds advisory Solid and
unused-import JS-plugin checks. The full Biome linter remains enabled until
rule and suppression parity is verified. In particular, `noPrivateImports`
and exact assignment-expression policy have no proven replacement. Existing
`biome-ignore` comments still apply to the compatibility gate; the new plugin
warnings do not silently turn those suppressions into CI errors. Advisory
fixes are not part of the default `fix` command.

Knip reports reachable runtime-cycle groups. Its findings are not equivalent
to Biome's cycle edges, especially for type-only dependencies. CI retains the
changed-file Biome cycle check and adds Knip's warning-only report.

## Editors

`apps/web/.zed/settings.json` selects Oxfmt's stdin formatter for TypeScript and
TSX when using the web project settings, without changing root settings for
other packages. It does not select an unverified native language-server client.
Use the installed native compiler's `--lsp` mode only with a compatible client.

## Nix dependency cache

Both platform hashes are refreshed. The Linux derivation builds locally and in
CI; the Darwin hash comes from the native Apple Silicon CI runner, not a Linux
cross-install. Run `just update-node-modules-hash` on each matching platform
when the workspace dependencies or native compiler wrapper change.

## Validation

`bun run check` validates schemas, native app and tooling-script types,
formatting, import organization, and the lint compatibility gates.
