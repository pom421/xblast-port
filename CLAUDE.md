# Instructions for Claude

Web port of XBlast (GPL). Goals, decisions and roadmap: `docs/plan.md`;
setup and layout: `README.md`.

## Rules

- **Simple first**: small code, no dependency or abstraction without a real need.
- **Determinism**: `packages/sim` is pure (integers only, seeded RNG, no DOM,
  Node or Bun API, no clock). Enforced by its tsconfig and by lint.
- **Faithful to the original**: when in doubt, the C code of XBlast 2.10.4 is
  the reference (`original/`, not versioned).
- Code, comments, commits and PRs in **English** (open to contributors).

## Workflow

- Toolchain: Vite+ (`vp`) manages Node and Bun; Bun only, never npm/pnpm.
- Before delivering: `vp check` and `vp run -r test`.
- Deliver through a **PR** (never push to `main`), then check its CI.
  Exception: Claude configuration only (`CLAUDE.md`, `.claude/`) goes straight
  to `main`.
- Commits: short title, bullet body. Prefixes: `feat:`, `fix:`, `test:`,
  `docs:`, `tooling:`.
- **Only contributor: the user.** Author and committer =
  `Pierre-Olivier Mauguet <mauguet.po@gmail.com>`; no `Co-Authored-By` or
  attribution line in commits or PRs (also enforced by `.claude/settings.json`).

## Answers to the user

- In French, short, bullet points, one intro sentence.
- Mentor tone: explain the "why" and one point to remember.
- Number the choices made unasked and the points to decide.
