# Nx Workspace Guide

## 1. Setup

Install dependencies from the workspace root (requires Node.js and `pnpm`):

```sh
pnpm install
```

> Run all `nx` commands from the **repository root** using `pnpm nx ...` (or install `nx` globally with `pnpm add -g nx`).

---

## 2. Running Tasks

### Common Commands

```sh
# Run a target for a specific service
pnpm nx <target> <service-name>

# Examples
pnpm nx serve assessment-service
pnpm nx build assessment-service
pnpm nx lint assessment-service
pnpm nx typecheck assessment-service
```

### Inspecting a Service's Available Targets

Nx automatically infers targets from your config files (`rolldown.config.ts`, `tsconfig.json`, `eslint.config.mjs`) and merges them with `project.json`. To see all available targets and exact commands for a service:

```sh
pnpm nx show project <service-name> --web
# or in terminal:
pnpm nx show project <service-name>
```

### Running Tasks Across Multiple Services

```sh
# Run a target across all services
pnpm nx run-many -t build
pnpm nx run-many -t lint test

# Run targets only on services affected by your git branch changes
pnpm nx affected -t build lint test

# Visualize service dependency graph
pnpm nx graph
```

---

## 3. Creating a New Service

All services live under `applications/<service-name>`.

Generate a new Node.js / TypeScript service using `@nx/node`:

```sh
pnpm nx g @nx/node:app applications/<service-name> --bundler=rolldown --linter=eslint
```

**Adding npm dependencies to your service:**
1. Add runtime dependencies in `applications/<service-name>/package.json` (used by Rolldown & lockfile pruning) and/or workspace root `package.json`.
2. Ensure `pnpm-workspace.yaml` includes `applications/*` if managing per-service `package.json` dependencies via pnpm workspaces, then run `pnpm install`.

---

## 4. Integrating an Existing Service into Nx

If you already wrote your service inside `applications/<service-name>` without using a generator, follow the steps below to hook it into Nx.

### 1. Create `applications/<service-name>/project.json`

Every service needs a `project.json` so Nx knows its name and metadata:

```json
{
  "name": "<service-name>",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "projectType": "application",
  "sourceRoot": "applications/<service-name>/src",
  "tags": []
}
```

### 2. Configure TypeScript, Bundler, and Linter

Nx plugins in `nx.json` automatically infer `build`, `typecheck`, and `lint` when these files exist in `applications/<service-name>`:
- `package.json` — sets package name (`@soa-final-term/<service-name>`) and runtime `dependencies`
- `tsconfig.json` & `tsconfig.app.json` — extends `../../tsconfig.base.json` (enables the `typecheck` target)
- `rolldown.config.ts` — bundles `src/main.ts` to `../../dist/applications/<service-name>` (enables the `build` target)
- `eslint.config.mjs` — extends `../../eslint.config.mjs` (enables the `lint` target)

You can copy `tsconfig.json`, `tsconfig.app.json`, `rolldown.config.ts`, `eslint.config.mjs`, and `project.json` from `applications/assessment-service` and replace `assessment-service` with `<service-name>`.

To configure how `pnpm nx serve <service-name>` runs your dev server, add a `serve` target in your `project.json`:

```json
{
  "targets": {
    "serve": {
      "executor": "nx:run-commands",
      "continuous": true,
      "options": {
        "cwd": "applications/<service-name>",
        "command": "tsx watch src/main.ts"
      }
    }
  }
}
```

### 3. Custom Commands (Docker, Codegen, Migrations, etc.)

Use the `nx:run-commands` executor in `applications/<service-name>/project.json` to wire any custom CLI command into Nx:

```json
{
  "name": "<service-name>",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "projectType": "application",
  "sourceRoot": "applications/<service-name>/src",
  "targets": {
    "build": {
      "executor": "nx:run-commands",
      "outputs": ["{workspaceRoot}/dist/applications/<service-name>"],
      "options": {
        "cwd": "applications/<service-name>",
        "command": "<your-build-command>"
      }
    },
    "serve": {
      "executor": "nx:run-commands",
      "continuous": true,
      "options": {
        "cwd": "applications/<service-name>",
        "command": "<your-dev-command>"
      }
    },
    "test": {
      "executor": "nx:run-commands",
      "options": {
        "cwd": "applications/<service-name>",
        "command": "<your-test-command>"
      }
    }
  }
}
```

---

## 5. Shared Packages & Service Dependencies

Shared libraries and contracts live in `packages/<pkg-name>`.

- **Generate a shared TS library:**
  ```sh
  pnpm nx g @nx/js:lib packages/<pkg-name>
  ```
  This registers the path alias in `tsconfig.base.json` so any TS service can import it directly (e.g., `import { ... } from '@soa-final-term/<pkg-name>'`).

- **Declare explicit project dependencies** (e.g., when a service depends on shared OpenAPI specs in `packages/docs` or another service):
  Add `implicitDependencies` in your service's `project.json`:
  ```json
  {
    "name": "<service-name>",
    "implicitDependencies": ["docs"]
  }
  ```

---

## 6. Verification Checklist Before Pushing

Before opening a PR, verify Nx recognizes and runs your service targets cleanly:

```sh
# 1. Confirm Nx detects your project and targets
pnpm nx show project <service-name>

# 2. Run build, lint, typecheck, and test for your service
pnpm nx run-many -t lint typecheck test build -p <service-name>
```
