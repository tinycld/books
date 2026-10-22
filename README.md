# books

Books is double-entry accounting for one organization. It keeps a chart of
accounts and a general ledger, and every entry balances.

The UI follows the QuickBooks Online model: familiar screens for accounts,
transactions and reports. It is a feature package for the
[tinycld](https://tinycld.org/) ecosystem and works on web and native. The
design lives in the tinycld docs, not in this repo.

## Development

The package is one member of a tinycld workspace. To work on it, clone it into
the workspace root, then link every member with one install at the root.

```sh
git clone git@github.com:tinycld/books.git

# At the WORKSPACE ROOT (never inside a member):
pnpm install

# Run the full stack (Expo + PocketBase) from the app.
cd tinycld
pnpm run dev
```

## Checks

All checks run **scoped to this member** through `tinycld-pkg`, which reuses the
app shell's biome config, tsconfig base, and vitest/playwright configs (so
`@tinycld/core/*`, uniwind augments, and PocketBase types all resolve):

```sh
cd books
pnpm exec tinycld-pkg check       # biome + typecheck
pnpm exec tinycld-pkg test        # vitest unit tests
pnpm exec tinycld-pkg test:e2e    # playwright e2e specs (full preset only — packages with screens)
```

This repo ships no `biome.json` — it inherits the ecosystem-wide rules through
the workspace-root config (which extends the app shell's canonical `biome.json`),
so `biome check .` from inside this member, single-file checks, and the editor's
biome LSP all resolve the right rules. Add a `biome.json` here only if this
package genuinely needs to override a rule:

```jsonc
{
    "$schema": "https://biomejs.dev/schemas/2.4.16/schema.json",
    "root": false,
    "extends": ["../tinycld/biome.json"],
    "linter": { "rules": { /* your overrides */ } }
}
```

## CI

`.github/workflows/ci.yml` runs typecheck, unit tests, and e2e on every push to
`main` and every PR. It checks out this PR's code into a member slot, assembles
the rest of the workspace (`app` + `core` + the workspace `package.json` and
coordination files) via `npx @tinycld/bootstrap --assemble-only`, installs at
the workspace root, and runs `tinycld-pkg check` / `tinycld-pkg test:e2e` —
exactly what a developer runs locally.

## Docs

- [GLOSSARY.md](GLOSSARY.md): the terms Books uses.
- [docs/adr/](docs/adr/): decisions and why we made them.
