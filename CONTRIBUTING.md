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
| `pnpm test:e2e`      | End-to-end tests (Playwright) in Chromium, Firefox and WebKit                            |
| `pnpm size`          | Bundle size budget (minified + gzip)                                                     |
| `pnpm audit`         | Known vulnerabilities in dependencies — must be zero; runs daily in CI (not on every PR) |
| `pnpm bench`         | Load measurements (not a gate; run when you touch the model, store or rendering)         |

## Architecture

```
packages/document  model, schemas, serialization, export   — no React, no DOM
packages/store     transactions, history, subscriptions       — no React
packages/engine    Editor, commands, controllers               — no React
packages/react     EditorProvider, DocumentView, UI            — the only package with React
packages/styles    CSS: tokens, layers, data-attribute contract
```

Dependencies only point down this list. Data flow:
`beforeinput / keydown → Editor.dispatch(intent) → command → Transaction → Change → Document → subscribers → React`.

## Conventions

- **Every document change goes through a command** (`editor.dispatch`). Never mutate blocks: they are immutable.
- **Untrusted input is validated** at the boundary (snapshots, clipboard, URLs) — see [SECURITY.md](SECURITY.md).
- **Algorithms over the tree must be linear.** `packages/engine/__tests__/scaling.test.ts` fails on quadratic growth.
- **Styling** uses the stable `data-inkbrick-*` attributes and `:where()` inside `@layer` (see `docs/styling.md`);
  `packages/styles/__tests__/contract.test.ts` enforces it.
- **UI strings** live in the dictionaries (`packages/react/src/i18n`); every key needs `en` and `ru`.
- **Comments explain why**, not what. Code comments and docs are written in Russian; public API docs in English
  are welcome too.
- **Tests:** a bug fix comes with a test that fails without the fix. UI behaviour that does not need a real browser
  is tested in jsdom (`packages/react/tests/harness.tsx`); real-browser behaviour in `tests/E2E`.

## Branching

The project follows [GitHub Flow](https://docs.github.com/en/get-started/using-github/github-flow):

- `master` is always releasable; nothing is pushed to it directly.
- Every task lives in a short-lived branch cut from `master`, named `type/short-description` with the same types as
  commit messages: `feat/touch-drag`, `fix/caret-after-split`, `docs/styling-guide`.
- Open a pull request early, keep it rebased on `master`, and merge it with **squash** so that `master` gets one
  commit per task (the squash commit message follows the commit format below).
- Delete the branch after merging.
- Releases are tagged on `master`. A `release/x.y` branch is created only when an older major version has to be
  maintained next to the current one; fixes are cherry-picked into it.

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
