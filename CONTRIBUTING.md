# Contributing to Inkbrick

Thanks for helping! This guide covers the setup, the checks every change must pass and the conventions of the
code base.

## Setup

Requirements: Node.js ≥ 20 and pnpm ≥ 9.

```bash
pnpm install
pnpm test:e2e:install   # browsers for Playwright, once
pnpm dev                # sandbox at http://127.0.0.1:5173
```

## Checks

CI runs all of them; please run the relevant ones locally before opening a pull request.

| Command              | What it checks                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm typecheck`     | TypeScript (strict) across all packages, tests and the sandbox                           |
| `pnpm lint`          | ESLint; Prettier and ESLint also run on staged files in the pre-commit hook              |
| `pnpm test:coverage` | Unit tests (Vitest) with coverage thresholds — the build fails if coverage drops         |
| `pnpm check:i18n`    | Dictionaries (en, ru, the German example): keys, `{placeholders}`, untranslated strings  |
| `pnpm test:e2e`      | End-to-end tests (Playwright) in Chromium, Firefox and WebKit                            |
| `pnpm size`          | Bundle size budget (minified + gzip)                                                     |
| `pnpm audit`         | Known vulnerabilities in dependencies — must be zero; runs daily in CI (not on every PR) |
| `pnpm bench`         | Load measurements (not a gate; run when you touch the model, store or rendering)         |
| `pnpm test:load`     | Load tests of the engine with time budgets: 50 000 blocks, a 100 × 20 table, mass edits  |
| `pnpm test:load:e2e` | Load tests in Chromium on the built sandbox: typing, paste, deletion, tables, images     |

Load tests fail when a scenario exceeds its time budget; `LOAD_BUDGET_SCALE=2` widens every budget on a slow machine
(CI uses 2). Each run prints a table of the measured times.

## Architecture

```
packages/document  model, schemas, serialization, export   — no React, no DOM
packages/store     transactions, history, subscriptions       — no React
packages/locales   UI dictionaries: English and on-demand languages — no React, no dependencies
packages/engine    Editor, commands, controllers               — no React
packages/dom       UI parts in plain DOM (color-picker, image-tools) — no React, no editor, usable on its own
packages/react     EditorProvider, DocumentView, UI            — React, loads parts of dom lazily
packages/styles    CSS: tokens, layers, data-attribute contract
```

### Layers and new packages

Each package imports only the packages below it. The order is `LAYERS` in `eslint.config.js`:

- `document` → `store` → `engine` → `react`;
- `locales` and `dom` depend on nothing, and only `react` uses them;
- only `react` imports React.

ESLint rejects an import against the order, by name or by a path into another package's folder.
`scripts/__tests__/boundaries.test.ts` checks that every package with code is listed in `LAYERS` and that the order has
no cycles.

**Public API.** What a package's entry exports is its public contract. `scripts/__tests__/public-api.test.ts` keeps the
list of exported names of every entry in a snapshot: a name that became public by accident (through `export *`) or
disappeared fails the test. When the change is intended, update the snapshot (`pnpm vitest run scripts -u`) and note it
in `CHANGELOG.md`. Prefer explicit named exports to `export *` in an entry. Mechanisms other packages need but
applications should not rely on go to a separate `internal` entry (`@inkbrick/engine/internal`, used by
`@inkbrick/react` only; the sandbox may not import it).

A new **package** is worth it only when at least one of these is true:

1. it is useful without the editor;
2. it brings other peer dependencies (a framework, a heavy library);
3. it needs its own release cycle or is a replaceable adapter.

Otherwise it is a folder in an existing package, with its own entry in `exports` when it must stay out of the main bundle
(`@inkbrick/document/markdown`, `@inkbrick/dom/color-picker`). Parts of the interface without a framework go to
`@inkbrick/dom` as a new entry, not as a new package.

For a new package:

- give it `tsconfig.json`, `tsup.config.ts` and `vitest.config.ts` like `packages/dom`;
- add a line in `LAYERS`;
- add a path in `tsconfig.json`;
- add a case in `scripts/size.mjs`;
- keep the shared version: all packages are released together under one version.

### Where things live

The packages are the **library**; `apps/sandbox` is the **demonstration** that uses it. The boundary is checked by
`scripts/__tests__/boundaries.test.ts` and by ESLint (`no-restricted-imports`).

| Belongs in the library (`packages/*`)                                               | Belongs in the sandbox (`apps/sandbox`)                                              |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Blocks, commands, schemas, controllers, UI components and their styles              | Pages and navigation: the editor and the table editor, the switch between them       |
| Strings the editor shows (`packages/locales`, en and ru)                            | Strings of the sandbox itself (`apps/sandbox/src/i18n`: menus, debug panel, notices) |
| Everything with a documented public API (`docs/`) and a bundle budget (`pnpm size`) | Demo data and generators (sample, random and 50,000-block documents)                 |
| Opt-in blocks and panels (`tableBlocks`, `TocPanel`, `FindReplacePanel`, …)         | The debug panel, tools menus, import and export of files, autosave                   |
| `data-inkbrick-*` attributes, the contract for application styles                   | `window.__inkbrick` and the test ids that E2E tests use to drive the demo            |
| —                                                                                   | An example of a custom block (`blocks/counter.tsx`) and an example language (`de`)   |

Rules that follow from it:

- The library never imports from `apps/` and never mentions the sandbox (no `window.__inkbrick`, no sandbox strings).
- The sandbox imports packages only through their public entry (`@inkbrick/react`), never through `src/` paths.
- A string belongs to exactly one dictionary: a key is either an editor key or a sandbox key, never both
  (`pnpm check:i18n` fails otherwise). If a sandbox needs an editor string, it uses `useT()` from the package.
- If something in the sandbox turns out to be useful to every user of the library, it moves to a package together with
  its tests, docs and ru/en strings.

Dependencies only point down this list. Data flow:
`beforeinput / keydown → Editor.dispatch(intent) → command → Transaction → Change → Document → subscribers → React`.

## Conventions

- **Every document change goes through a command** (`editor.dispatch`). Never mutate blocks: they are immutable.
- **Untrusted input is validated** at the boundary (snapshots, clipboard, URLs) — see [SECURITY.md](SECURITY.md).
- **Algorithms over the tree must be linear.** `packages/engine/__tests__/scaling.test.ts` fails on quadratic growth.
- **Styling** uses the stable `data-inkbrick-*` attributes and `:where()` inside `@layer` (see `docs/styling.md`);
  `packages/styles/__tests__/contract.test.ts` enforces it.
- **UI strings** live in the dictionaries (`packages/locales` for the editor, `apps/sandbox/src/i18n` for the sandbox);
  every key needs `en` and `ru`, and `pnpm check:i18n` checks that the keys, the `{placeholders}` and the translations match.
- **Comments explain why**, not what. Code comments and docs are written in Russian; public API docs in English
  are welcome too.
- **Tests:** a bug fix comes with a test that fails without the fix. UI behaviour that does not need a real browser
  is tested in jsdom (`packages/react/tests/harness.tsx`); real-browser behaviour in `tests/E2E`.

## Branching

Work is accumulated in `develop` and released to `master` in one go:

- `master` is always releasable and `develop` is the integration branch; nothing is pushed to either directly, both are
  changed by pull requests only.
- Every task lives in a short-lived branch cut from `develop`, named `type/short-description` with the same types as
  commit messages: `feat/touch-drag`, `fix/caret-after-split`, `docs/styling-guide`.
- Open a pull request **into `develop`** early, keep it up to date with `develop`, and merge it with **squash**, so that
  `develop` gets one commit per task (the squash commit message follows the commit format below).
- Delete the branch after merging.
- A release is one pull request `develop` → `master`, merged with a **merge commit** (not squash), so that `master`
  keeps the commit of every task. In it, `Unreleased` in `CHANGELOG.md` becomes the version with a date. The release is
  tagged `vX.Y.Z` on `master` (the tag starts `release.yml`), then `develop` is brought up to date with `master`.
- Urgent fixes of a released version are cut from `master`, merged into `master`, and then merged back into `develop`.
- A `release/x.y` branch is created only when an older major version has to be maintained next to the current one;
  fixes are cherry-picked into it.

## Commit messages

Every commit message follows [Conventional Commits](https://www.conventionalcommits.org/) and is written in English:

`type(scope): description`

Allowed types:

- `feat` — new functionality
- `fix` — bug fixes
- `refactor` — internal restructuring without behavior changes
- `test` — test changes
- `chore` — maintenance tasks
- `ci` — CI/CD configuration
- `docs` — documentation
- `build` — build system and dependencies

The scope is required and names the affected area, for example `document`, `store`, `engine`, `react`, `styles`,
`sandbox`, `e2e`, `deps`, `ci` or `docs`. Breaking changes are marked with `!` and explained in a
`BREAKING CHANGE:` footer.

Examples:

- `feat(react): add touch drag for block handles`
- `fix(engine): keep the caret after undoing a split`
- `refactor(store): isolate listener error reporting`
- `test(document): cover repairSnapshot for cyclic trees`
- `docs(security): describe the CSP requirements`

The `commit-msg` hook (`.husky/commit-msg`) rejects messages that do not match.

## Commit granularity

- One logical change per commit; the message says what changed and why.
- Keep unrelated changes in separate commits, and independent refactoring apart from behavior changes.
- Include the tests with the implementation.
- No vague messages such as `fix`, `update`, `final` or `changes`.
- Each commit should be understandable when reviewed on its own.

## Pull requests

- Keep a pull request focused on one task or a closely related set of changes; its title follows the same format.
- Update `CHANGELOG.md` (section _Unreleased_) for user-visible changes.
- A pull request needs green CI.
