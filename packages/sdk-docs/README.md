# Macro SDK documentation

The public SDK source and its comments are the source of truth. TypeDoc and
typedoc-plugin-markdown generate a canonical Markdown hierarchy and an HTML
reference from one reflection model, including linked API request and response
types. Private, protected and internal members are excluded.

From this directory:

```sh
bun run generate
bun run check:generated
bun run type-check
bun run test
bun run docs:dev
```

The generated [Markdown reference](reference/README.md) is checked in under
`reference/` so SDK changes include reviewable documentation. Edit SDK source
comments or declarations, then run `bun run generate` and commit the regenerated
reference. Generated pages are collapsed by default in pull requests.

`bun run check:generated` renders fresh Markdown and HTML into ignored
`dist/docs/` and compares every Markdown path and byte against `reference/`.
It fails on changed, added or removed pages without rewriting the reference.
`bun run test` performs this check before testing public contracts, so CI catches
stale documentation. `bun run build` produces only ignored build assets.

Wrangler serves the HTML as static assets without a request handler, credentials,
database or model calls. It builds the docs before serving them without modifying
the checked-in reference. To publish to your configured Cloudflare account,
run `bun run docs:deploy`.

Other build packages can import `renderSdkDocs` from
`@macro-inc/sdk-docs/render` and consume the canonical Markdown. This package
does not create Deno bundles or backend artifacts.
