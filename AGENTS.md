# AGENTS.md

Vue 3 + Vite + TypeScript SPA (official create-vue scaffold) with Pinia and Vue Router. JSX is supported via `@vitejs/plugin-vue-jsx`.

## Commands

- `npm run dev` — dev server
- `npm run build` — type-check + production build (runs both in parallel via `npm-run-all2`)
- `npm run type-check` — `vue-tsc --build`
- No test framework, linter, or formatter is configured. Do not invent test/lint commands; `npm run type-check` is the only verification step.

## Type checking

- Always use `vue-tsc`, never plain `tsc` — only vue-tsc resolves `.vue` imports.
- Project references: root `tsconfig.json` only points at `tsconfig.app.json` (app code) and `tsconfig.node.json` (vite.config.ts). Run type-check from the repo root.
- `noUncheckedIndexedAccess` is enabled in `tsconfig.app.json`: array/object lookups return `T | undefined` and need narrowing or the build fails.

## Conventions

- `@/*` aliases `src/*` (configured in both `vite.config.ts` and `tsconfig.app.json`).
- Entry: `src/main.ts` installs Pinia and the router (`src/router/index.ts`); stores live in `src/stores/`.
- Node `^22.18.0 || >=24.12.0` required (`engines` field).
