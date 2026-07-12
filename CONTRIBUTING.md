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

1. Update `version` in `package.json`.
2. Run the CI workflow and the publish workflow in dry-run mode.
3. Create a GitHub release tagged `v<package-version>`.
4. The release workflow publishes the matching version to npm with provenance.

The first npm publication requires an `NPM_TOKEN` environment secret. After
the package exists, configure this repository as an npm trusted publisher and
remove the token secret.
