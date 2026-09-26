# Contributing

## Development

```bash
bun install
bun run test
bun run build
```

Changes should include tests for new behavior and must keep the package free of
runtime dependencies unless a dependency is clearly justified.

## Releases

1. Update `version` in `package.json` and `SDK_VERSION` in
   `src/transport.ts` (sent as the `X-ZeroLeaks-SDK` header) to the same value.
2. Run the CI workflow and the publish workflow in dry-run mode.
3. Create a GitHub release tagged `v<package-version>`.
4. The release workflow checks that the tag matches `package.json` and
   publishes that version to npm with provenance.

The package is published, so releases should go through npm trusted
publishing. The workflow still uses an `NPM_TOKEN` environment secret when one
is set; remove it once trusted publishing is configured.
