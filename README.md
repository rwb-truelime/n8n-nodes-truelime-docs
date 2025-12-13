![Banner image](https://user-images.githubusercontent.com/10284570/173569848-c624317f-42b1-45a6-ab09-f0ea3c247648.png)

# n8n-nodes-limescape-docs

Custom n8n community node providing OCR & AI-driven document extraction via [\`limescape-docs\`](https://limescape.ai).

## Features

- **Multi-Provider Support**: Works with OpenAI, Azure OpenAI, Azure AI Foundry, Google Gemini, Google Vertex AI, and AWS Bedrock
- **OCR & Document Processing**: Convert PDFs and images to structured text using vision models
- **Schema-Based Extraction**: Extract structured data from documents using JSON schemas
- **Page-by-Page Extraction**: Process each page as a separate LLM call to prevent hallucination on large documents
- **Flexible Configuration**: Extensive options for image processing, concurrency, and LLM parameters

## Installation

### In n8n (Recommended)

1. Go to **Settings** > **Community Nodes**
2. Select **Install**
3. Enter \`n8n-nodes-limescape-docs\`
4. Select **Install**

### Manual Installation

\`\`\`bash
pnpm add n8n-nodes-limescape-docs
\`\`\`

> **Note**: This package uses pnpm as the package manager.

## Credentials Setup

Before using the node, configure credentials for your AI provider(s) in n8n:

1. Go to **Credentials** > **New Credential**
2. Search for **Limescape Docs Credentials API**
3. Fill in the credentials for your provider(s):

| Provider | Required Fields |
|----------|-----------------|
| **OpenAI** | API Key |
| **Azure OpenAI** | API Key, Endpoint, (optional) API Version |
| **Azure AI Foundry** | Base URL, API Key |
| **Google Gemini** | API Key |
| **Google Vertex AI** | Service Account JSON, Location |
| **AWS Bedrock** | Region, (optional) Access Key ID, Secret Access Key, Session Token |

## Node Configuration

### Basic Settings

| Option | Description |
|--------|-------------|
| **Model Provider** | Select your AI provider |
| **Model** | Choose from preset models or use custom |
| **Custom Model** | Override with a specific model ID |
| **Schema** | JSON schema for structured data extraction |
| **Input Binary Field** | Name of the binary property containing the file (default: \`data\`) |

### Processing Options

| Option | Default | Description |
|--------|---------|-------------|
| Cleanup Temp Files | \`true\` | Automatically delete temporary files after processing |
| Concurrency | \`10\` | Maximum parallel operations within the processor |
| Correct Orientation | \`true\` | Auto-correct document image orientation |
| Direct Image Extraction | \`false\` | Extract from images without full OCR |
| Enable Hybrid Extraction | \`false\` | Use combined OCR/extraction techniques |
| Extract Only | \`false\` | Skip OCR and only perform extraction |
| Extract Page-by-Page | \`false\` | Process each page as a separate LLM extraction call |
| Extract Per Page Keys | \`[]\` | Schema keys to extract per page (top-level only) |
| Image Density (DPI) | \`150\` | Resolution for image conversion |
| Image Format | \`png\` | Intermediate image format (PNG or JPEG) |
| Image Height (Pixels) | \`3072\` | Target height for image resizing |
| Maintain Format | \`false\` | Preserve original formatting in markdown |
| Max Image Size (MB) | \`15\` | Maximum size for images sent to LLM |
| Max Retries | \`1\` | Retries for failed LLM calls |
| Pages To Convert | \`""\` | Comma-separated page ranges (e.g., \`1,3-5\`) |

### Extraction Specifics

Override model/provider specifically for the extraction step:

| Option | Description |
|--------|-------------|
| Extraction Model Provider | Different provider for extraction |
| Extraction Model | Different model for extraction |
| Custom Extraction Model | Custom model ID for extraction |
| Extraction Prompt | Specific prompt for extraction step |

### LLM Parameters

Fine-tune model behavior for both OCR and extraction steps:

| Parameter | Description |
|-----------|-------------|
| Temperature | Controls randomness (0.0-2.0) |
| Top P | Nucleus sampling threshold |
| Frequency Penalty | Reduce repetition of token sequences |
| Presence Penalty | Reduce repetition of topics |
| Max Tokens | Maximum tokens in response |

## Output Structure

The node outputs a single item with aggregated results:

\`\`\`json
{
  "processedFiles": 1,
  "filenames": "document.pdf",
  "filetypes": "pdf",
  "markdown": "### Attachment Start: document.pdf...",
  "totalCompletionTime": 5000,
  "totalInputTokens": 1500,
  "totalOutputTokens": 800,
  "totalPagesProcessed": 3,
  "aggregatedExtracted": [{ "invoiceNumber": "INV-001" }],
  "aggregatedSummaries": "...",
  "processingIssues": []
}
\`\`\`

### Page-by-Page Mode

When \`Extract Page-by-Page\` is enabled, \`aggregatedExtracted\` contains an array of per-page extraction objects instead of per-file.

## Development

### Prerequisites

- **Node.js** >= 18.10
- **pnpm** >= 9.1

### Setup

\`\`\`bash
# Clone the repository
git clone https://github.com/rwb-truelime/n8n-nodes-truelime-doc.git
cd n8n-nodes-truelime-doc

# Install dependencies
pnpm install
\`\`\`

### Available Scripts

| Script | Description |
|--------|-------------|
| \`pnpm dev\` | Start n8n with node loaded and hot reload |
| \`pnpm build\` | Compile TypeScript and build icons |
| \`pnpm build:watch\` | Build in watch mode |
| \`pnpm lint\` | Check code for errors |
| \`pnpm lintfix\` | Auto-fix linting issues |
| \`pnpm format\` | Format code with Prettier |

### Local Development

\`\`\`bash
# Start n8n with your node loaded
pnpm dev

# Open http://localhost:5678 in your browser
\`\`\`

### Versioning

This project follows n8n's hybrid versioning model:

- **Light versioning**: Minor updates within a major version use version arrays (e.g., \`version: [1.21, 1.22, 1.23]\`)
- **Full versioning**: Breaking changes create new major implementations with \`VersionedNodeType\`

## Project Structure

\`\`\`
├── credentials/
│   └── LimescapeDocsApi.credentials.ts   # Provider credentials schema
├── nodes/
│   └── LimescapeDocs/
│       ├── LimescapeDocs.node.ts         # Versioned entry node
│       ├── LimescapeDocs.node.json       # Node metadata
│       └── v1/
│           └── LimescapeDocsV1.node.ts   # V1 implementation
├── icons/                                 # Node icons
├── package.json
└── tsconfig.json
\`\`\`

## Resources

- **[Limescape AI](https://limescape.ai)** - Official website
- **[n8n Node Documentation](https://docs.n8n.io/integrations/creating-nodes/)** - Building n8n nodes
- **[n8n Community Forum](https://community.n8n.io/)** - Get help and share

## License

[MIT](LICENSE.md)
