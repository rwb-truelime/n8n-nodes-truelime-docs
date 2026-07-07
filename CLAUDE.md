# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An n8n **community node package** (`n8n-nodes-limescape-docs`) that wraps the
[`limescape-docs`](https://limescape.ai) library to provide OCR & AI-driven document
extraction inside n8n workflows. The node itself is a thin adapter: it maps n8n
parameters/credentials to a single `limescapeDocs()` call and aggregates the results.
Almost all real work (OCR, page conversion, LLM calls, extraction) happens inside the
`limescape-docs` library, not here.

## Commands

pnpm is **mandatory** — a `preinstall` hook (`only-allow pnpm`) blocks npm/yarn.

| Command | Purpose |
|---------|---------|
| `pnpm install` | Install deps |
| `pnpm build` | `tsc` → `dist/`, then `gulp build:icons` copies `.svg`/`.png` into `dist/` |
| `pnpm dev` | Run n8n with this node hot-reloaded (`n8n-node dev`) |
| `pnpm build:watch` | Rebuild on change (`n8n-node build --watch`) |
| `pnpm lint` / `pnpm lintfix` | ESLint over `nodes credentials package.json` (n8n-nodes-base rules) |
| `pnpm format` | Prettier over `nodes` and `credentials` |

There is **no test suite** — verification is `pnpm lint` + `pnpm build` (both run by
`prepublishOnly`), plus manual testing via `pnpm dev`. CI (`.github/workflows/ci.yml`)
would run `pnpm install --frozen-lockfile` → lint → build on Node 22, but is **disabled
(manual `workflow_dispatch` only)**: `limescape-docs` is a local `file:` tarball (see
below) that isn't available on hosted runners, so `pnpm install` fails. Re-enable the
`pull_request`/`push` triggers once that dependency is published to a reachable registry.

## The `limescape-docs` dependency (important)

`limescape-docs` is **not** pulled from npm. In `package.json` it points at a local
tarball built from a sibling repo:

```
"limescape-docs": "file:/home/rodger/truelime-git-projects/limescape-ai-limescape-docs/limescape-docs-1.23.0.tgz"
```

- The node's TypeScript imports (`limescapeDocs`, `LimescapeDocsArgs`, `ModelCredentials`,
  `LLMParams`, `ModelProvider`, `ErrorMode`) all come from this library. Its types define
  the contract the node builds against.
- To pick up library changes you must re-pack that sibling repo and reinstall the `.tgz`.
- It also appears under `pnpm.onlyBuiltDependencies` in `pnpm-workspace.yaml` alongside
  native deps (`sharp`, `tesseract.js`, `isolated-vm`, etc.) so their build scripts run.

## Architecture

### Versioning (hybrid n8n model)

- `nodes/LimescapeDocs/LimescapeDocs.node.ts` — the `VersionedNodeType` **entry class**.
  It only maps version numbers → implementations (`nodeVersions`) and sets
  `defaultVersion`. No logic lives here.
- `nodes/LimescapeDocs/v1/LimescapeDocsV1.node.ts` — the actual `INodeType`
  implementation (~1000 lines): property schema, `loadOptions`, and `execute`.
- **Light versioning** (backward-compatible minor bumps, e.g. 1.22 → 1.23): add the version
  to the V1 `version: [...]` array *and* map it to the same `LimescapeDocsV1` in the entry
  class's `nodeVersions`.
- **Full versioning** (breaking changes): create `v2/LimescapeDocsV2.node.ts`, import it,
  and map new versions to it. Old versions must keep pointing at V1 so existing workflows
  never break. The entry class file has a detailed header comment explaining both paths.
- For minor-version-specific field behavior within one major, use `@version` checks in a
  property's `displayOptions` to show/hide it.

### Keeping versions in sync

A version bump touches several places that must agree:
`package.json` `version` → `nodes/.../LimescapeDocs.node.json` `nodeVersion` → entry class
`defaultVersion` + `nodeVersions` map → V1 `version: [...]` array.

### Execution flow (`LimescapeDocsV1.execute`)

1. Read global parameters once (provider, model, schema, the four collection params).
2. Validate safeguards: `maxTokens` must be 1024–16383; `imageDensity` ≥ 70.
3. Map n8n credentials → library `ModelCredentials` via `mapCredentialsForProvider`
   (also does per-provider required-field validation).
4. Loop over input items. Per item: apply the **attachment filter** (include/exclude by
   file extension), write the binary to a **temp file**, build `LimescapeDocsArgs` via
   `buildLimescapeArgsForItem`, call `limescapeDocs({ ...args, errorMode: THROW })`, then
   aggregate. The temp file is always cleaned up in a `finally`.
5. **Aggregation pattern:** all input items are merged into a **single output item**
   (concatenated markdown, summed tokens/time, arrays of extracted data). Per-item errors
   are pushed as error items and don't abort the batch.
6. `extractPageByPage` changes aggregation: `aggregatedExtracted` becomes an array of
   per-page objects (from `result.pages[].extracted`) instead of per-file.

### Helper functions (top of the V1 file)

`parsePages` (parses `"1,3-5"` ranges), `buildLLMParams` (collection → `LLMParams`,
skipping empty values), `parseSchema` (JSON string → object, throws `NodeOperationError`
on bad JSON), `mapCredentialsForProvider`, `buildLimescapeArgsForItem`.

### loadOptions methods

- `getModelsForProvider` — populates the Model dropdown per selected provider. **Model
  lists are hardcoded here** and must be kept in sync with what the library/providers
  support. The `extractionModel` options list is a separate hardcoded list.
- `getSchemaPropertyKeys` — parses the Schema JSON to offer top-level keys for the
  "Extract Per Page Keys" multiOptions field.

### Credentials

One credential type `limescapeDocsApi` (`credentials/LimescapeDocsApi.credentials.ts`)
holds fields for **all six providers** (OpenAI, Azure OpenAI, Azure AI Foundry, Google
Gemini, Google Vertex, AWS Bedrock). `mapCredentialsForProvider` picks the relevant subset
at runtime based on the selected provider.

## Deployment (Docker → Azure Container Registry)

Two Dockerfiles bake this node into an n8n image: `Dockerfile` (n8n v1) and
`Dockerfile-n8n-v2` (n8n v2). The v2 image is a multi-stage Alpine build that installs
system deps for document processing (`libreoffice`, `ghostscript`, `poppler-utils`, JRE,
fonts) since `n8nio/base` no longer ships `apk`.

`build-and-push-n8n-v2.fish` is the release script: lint → build → `pnpm pack` → docker
build → push to `tlteamai.azurecr.io/n8n/truelime-n8n`. It auto-resolves the latest n8n v2
version (override with `N8N_VERSION`). Requires `az acr login --name tlteamai` /
`docker login tlteamai.azurecr.io`.

## Adding a new provider

1. Add `INodeProperties` fields for its credentials in `LimescapeDocsApi.credentials.ts`.
2. Add a branch to `mapCredentialsForProvider` building the library `ModelCredentials`.
3. Add the provider to the `modelProvider` (and `extractionModelProvider`) `options`, and
   add its model presets to `getModelsForProvider`.
4. Wire any provider-specific args through `buildLimescapeArgsForItem` if needed.

## Conventions

- Shell scripts in this repo are **Fish**, not Bash.
- TypeScript is `strict` with `noUnusedLocals` and `noImplicitReturns` — no dead locals.
- User-facing errors use `NodeOperationError` (with `itemIndex`), never bare throws.
- Every node property carries both a `description` and a `hint`.
- The current branch `n8n-upgrade-to-v2` targets `n8n-workflow` v2 peer deps (`^2.15.0`).
