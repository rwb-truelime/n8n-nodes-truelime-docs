# Copilot Instructions for n8n-nodes-truelime-docs

Purpose: Help AI coding agents work productively in this repository by documenting architecture, workflows, project conventions, and integration points specific to this codebase.

## Big Picture
- Node package: Custom n8n community node providing OCR & AI-driven document extraction via `limescape-docs`.
- Primary components:
  - `nodes/LimescapeDocs/LimescapeDocs.node.ts`: Node implementation, parameters, execution, data shaping.
  - `credentials/LimescapeDocsApi.credentials.ts`: Credentials schema mapped to multiple model providers.
  - `icons/` + `gulpfile.js`: Icon build pipeline (`gulp build:icons`).
  - `package.json`: Scripts, n8n manifest (`n8n.credentials` and `n8n.nodes`), dependency on a local tarball `limescape-docs-1.1.21.tgz`.
- Key external libs: `n8n-workflow`, `n8n-core` (dev), and `limescape-docs` (local tgz). The node delegates heavy lifting to `limescape-docs`.

## Execution Flow
- Input: Binary or file path from upstream node/workflow.
- The node constructs `LimescapeDocsArgs` using helpers:
  - `parsePages(...)`: Convert comma-separated ranges → numeric arrays.
  - `buildLLMParams(...)`: Convert numeric/string UI inputs → `LLMParams`.
  - `parseSchema(...)`: Parse JSON schema string → object; errors become `NodeOperationError`.
  - `mapCredentialsForProvider(...)`: Translate n8n credential properties to `ModelCredentials` for provider.
  - `buildLimescapeArgsForItem(...)`: Assemble `filePath`, model/provider, extraction options, `llmParams`.
- Processing: Calls `limescapeDocs(args)` (from `limescape-docs`) with constructed options; returns structured data and optionally binary artifacts.
- Outputs: Single main output; success pathway only. Errors use `NodeOperationError` with `itemIndex` context.

## Project Conventions
- Provider selection: `modelProvider` is an enum from `limescape-docs` (`OPENAI`, `AZURE`, `AZURE_AIF`, `GOOGLE`, `VERTEX`, `BEDROCK`). Choose model via `model` or override via `customModel`.
- Credentials mapping rules (examples):
  - OpenAI → `apiKey` from `openaiApiKey`.
  - Azure → `apiKey`, `endpoint`, optional `azureApiVersion`.
  - Azure AI Foundry → `baseUrl`, `apiKey`.
  - Google (direct) → `apiKey`.
  - Vertex → `serviceAccount` (JSON string), `location`.
  - Bedrock → `region`, optional `accessKeyId`, `secretAccessKey`, `sessionToken`.
- Schema input: Accepts stringified JSON. Empty (`""` or `{}`) treated as undefined. Parsing failure throws `NodeOperationError`.
- Pages input: Use `"1,3-5"` style for `pagesToConvertAsImages` and `extractPerPage` (the latter stays as string tokens, not numbers).
- Icons: Use `file:limescape-logo-square.svg` and keep icon build via gulp consistent.
- Outputs: One `main` output only; inputs configured explicitly as `main`.

## Build & Dev Workflows
- Package manager: pnpm enforced via `preinstall` (`npx only-allow pnpm`). Use pnpm for all commands.
- Preferred dev via n8n-node CLI:
  - Install globally: `npm install --global @n8n/node-cli` then verify with `n8n-node --version`.
  - Run local preview: `n8n-node dev` (starts n8n at `http://localhost:5678`, auto-rebuilds on changes).
  - Build: `n8n-node build` (compiles TS and bundles assets).
  - Lint: `n8n-node lint` or `n8n-node lint --fix`.
- Repo scripts (pnpm):
  - `pnpm build`: Compile TS and generate icons (`tsc && gulp build:icons`). Produces `dist/` consumed by n8n.
  - `pnpm dev`: Currently `tsc --watch` (type compilation only). Prefer `n8n-node dev` for end-to-end local testing.
  - `pnpm build:watch`: Continuous build via `n8n-node build --watch`.
  - `pnpm lint`: ESLint over `nodes`, `credentials`, `package.json` with `eslint-plugin-n8n-nodes-base`.
  - `pnpm lintfix`: Same with `--fix`.
  - `pnpm format`: Prettier format `nodes` and `credentials`.
  - `pnpm prepublishOnly`: Build and lint before publish.
- Node/TS versions: Node `>=18.10` in `engines`; repo dev deps reference latest ESLint/TS. Types require `n8n-workflow`/`n8n-core` dev deps.
- n8n manifest:
  - Ensure node and credentials point to compiled JS files under `dist/**` in `package.json` `n8n` section.

## Integration Points
- `limescape-docs`: Imported from local tarball listed in `dependencies`. If updating API, align types imported (`LimescapeDocsArgs`, `ModelCredentials`, `LLMParams`, enums).
- Binary handling: `IBinaryData` available; if returning files, use n8n’s binary item format. Respect `outputDir/tempDir/cleanup` options.
- Error handling: Use `NodeOperationError` with meaningful messages and `itemIndex` when item-specific; avoid generic throws.

## Common Patterns to Follow
- Parameter hygiene: Coerce numbers via `Number(...)`, booleans via presence checks; skip undefined/empty values to avoid noisy args.
- Serializable schema: Accept string or object; normalize once per item; never double-parse.
- Provider-specific validations: Enforce required creds per provider early via `mapCredentialsForProvider(...)`.
- Minimal outputs: Keep one main output; adhere to n8n linter hints noted in comments.

## Example: Adding a New Provider Field
- Extend `LimescapeDocsApi.credentials.ts` with new `INodeProperties` entries.
- Update `mapCredentialsForProvider(...)` to construct `ModelCredentials` for the new provider.
- Add option in `modelProvider` and model presets in `Model` options.
- Wire through `buildLimescapeArgsForItem(...)` if special args required.

## Local Testing Tips
- Build, then load `dist/` into n8n:
  - Link this package into an n8n instance or place it in community nodes. Ensure `package.json` `n8n.nodes` points to `dist/nodes/...`.
- Validate credentials and schema behavior using minimal PDFs and JSON schema strings.
- Use `pnpm lint` and `eslint-plugin-n8n-nodes-base` rules to catch n8n-specific issues.

## Key Files
- `nodes/LimescapeDocs/LimescapeDocs.node.ts`: Node parameters, args assembly, execution.
- `credentials/LimescapeDocsApi.credentials.ts`: Provider credentials inputs.
- `package.json`: Scripts, `n8n` manifest, dependency on `limescape-docs` tarball.
- `gulpfile.js`, `icons/`: Icon build.

If any workflow steps or assumptions are unclear (e.g., how you load `dist/` into your local n8n instance), let me know and I’ll refine these instructions to match your setup.