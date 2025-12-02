import {
  INodeType,
  INodeTypeDescription,
  IExecuteFunctions,
  INodeExecutionData,
  IDataObject,
  NodeOperationError,
  IBinaryData,
} from 'n8n-workflow';
import {
    limescapeDocs,
    LimescapeDocsArgs,
    ModelCredentials,
    ErrorMode as LimescapeErrorMode,
    ModelProvider as LimescapeModelProvider,
    LLMParams,
} from 'limescape-docs';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Helper function to safely create a temporary directory if needed
const ensureDirSync = (dirPath: string) => {
  try {
      fs.mkdirSync(dirPath, { recursive: true });
  } catch (err: any) {
      if (err.code !== 'EEXIST') {
          throw err; // Re-throw if it's not a "directory already exists" error
      }
  }
};

// Helper to parse comma-separated numbers/ranges into page numbers
const parsePages = (pagesStr: string | undefined): number[] | undefined => {
    if (!pagesStr) return undefined;

    const result: number[] = [];
    const parts = pagesStr
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

    for (const part of parts) {
        if (part.includes('-')) {
            const [startStr, endStr] = part.split('-').map((v) => v.trim());
            const start = Number(startStr);
            const end = Number(endStr);
            if (!Number.isNaN(start) && !Number.isNaN(end) && start > 0 && end >= start) {
                for (let i = start; i <= end; i++) {
                    result.push(i);
                }
            }
        } else {
            const value = Number(part);
            if (!Number.isNaN(value) && value > 0) {
                result.push(value);
            }
        }
    }

    return result.length > 0 ? result : undefined;
};

// Helper to build LLM params from n8n collection input
const buildLLMParams = (input: IDataObject): Partial<LLMParams> => {
    const params: Partial<Record<string, unknown>> = {};

    if (input.temperature !== undefined && input.temperature !== null && input.temperature !== '') {
        params.temperature = Number(input.temperature);
    }
    if (input.topP !== undefined && input.topP !== null && input.topP !== '') {
        params.topP = Number(input.topP);
    }
    if (input.frequencyPenalty !== undefined && input.frequencyPenalty !== null && input.frequencyPenalty !== '') {
        params.frequencyPenalty = Number(input.frequencyPenalty);
    }
    if (input.presencePenalty !== undefined && input.presencePenalty !== null && input.presencePenalty !== '') {
        params.presencePenalty = Number(input.presencePenalty);
    }
    if (input.maxTokens !== undefined && input.maxTokens !== null && input.maxTokens !== '') {
        params.maxTokens = Number(input.maxTokens);
    }
    if (input.maxOutputTokens !== undefined && input.maxOutputTokens !== null && input.maxOutputTokens !== '') {
        params.maxOutputTokens = Number(input.maxOutputTokens);
    }
    if (input.logprobs !== undefined && input.logprobs !== null && input.logprobs !== '') {
        params.logprobs = Boolean(input.logprobs);
    }
    return params as Partial<LLMParams>;
};

// Helper to parse schema once from node parameter
const parseSchema = (
    node: IExecuteFunctions,
    rawSchema: string | object | undefined,
): Record<string, unknown> | undefined => {
    if (!rawSchema) return undefined;

    let schema: unknown = rawSchema;

    if (typeof rawSchema === 'string') {
        const trimmed = rawSchema.trim();
        if (trimmed === '' || trimmed === '{}') return undefined;
        try {
            schema = JSON.parse(trimmed);
        } catch (error) {
            throw new NodeOperationError(
                node.getNode(),
                `Invalid JSON schema provided: ${error instanceof Error ? error.message : String(error)}`,
                { itemIndex: -1 },
            );
        }
    }

    if (typeof schema !== 'object' || schema === null) {
        return undefined;
    }

    return schema as Record<string, unknown>;
};

// Helper to map n8n credentials to library ModelCredentials
const mapCredentialsForProvider = (
    node: IExecuteFunctions,
    provider: LimescapeModelProvider,
    credentials: IDataObject,
): ModelCredentials => {
    if (provider === LimescapeModelProvider.OPENAI) {
        if (!credentials.openaiApiKey) {
            throw new NodeOperationError(node.getNode(), 'OpenAI API Key is required when using OpenAI as the provider.', {
                itemIndex: -1,
            });
        }
        return {
            apiKey: credentials.openaiApiKey as string,
        };
    }

    if (provider === LimescapeModelProvider.AZURE) {
        if (!credentials.azureApiKey || !credentials.azureEndpoint) {
            throw new NodeOperationError(
                node.getNode(),
                'Azure API Key and Azure Endpoint are required when using Azure as the provider.',
                { itemIndex: -1 },
            );
        }
        return {
            apiKey: credentials.azureApiKey as string,
            endpoint: credentials.azureEndpoint as string,
            azureApiVersion: (credentials.azureApiVersion as string | undefined) || undefined,
        } as ModelCredentials;
    }

    if (provider === LimescapeModelProvider.AZURE_AIF) {
        if (!credentials.azureAifApiKey || !credentials.azureAifBaseUrl) {
            throw new NodeOperationError(
                node.getNode(),
                'Azure AI Foundry API Key and Base URL are required when using Azure AI Foundry as the provider.',
                { itemIndex: -1 },
            );
        }
        return {
            apiKey: credentials.azureAifApiKey as string,
            // SDK expects `baseURL` (uppercase URL). Use exact key.
            baseURL: credentials.azureAifBaseUrl as string,
        } as ModelCredentials;
    }

    if (provider === LimescapeModelProvider.GOOGLE) {
        if (!credentials.googleApiKey) {
            throw new NodeOperationError(node.getNode(), 'Google API Key is required when using Google as the provider.', {
                itemIndex: -1,
            });
        }
        return {
            apiKey: credentials.googleApiKey as string,
        } as ModelCredentials;
    }

    if (provider === LimescapeModelProvider.VERTEX) {
        if (!credentials.vertexServiceAccount || !credentials.vertexLocation) {
            throw new NodeOperationError(
                node.getNode(),
                'Vertex AI Service Account and Location are required when using Google Vertex as the provider.',
                { itemIndex: -1 },
            );
        }
        return {
            serviceAccount: credentials.vertexServiceAccount as string,
            location: credentials.vertexLocation as string,
        } as ModelCredentials;
    }

    if (provider === LimescapeModelProvider.BEDROCK) {
        return {
            region: credentials.bedrockRegion as string,
            accessKeyId: (credentials.bedrockAccessKeyId as string | undefined) || undefined,
            secretAccessKey: (credentials.bedrockSecretAccessKey as string | undefined) || undefined,
            sessionToken: (credentials.bedrockSessionToken as string | undefined) || undefined,
        } as ModelCredentials;
    }

    throw new NodeOperationError(node.getNode(), `Unsupported provider type in mapCredentialsForProvider: ${provider}`, {
        itemIndex: -1,
    });
};

interface BuildArgsInput {
    filePath: string;
    modelProvider: LimescapeModelProvider;
    model: string;
    schema?: Record<string, unknown>;
    processingOptions: IDataObject;
    extractionOptions: IDataObject;
    llmParams: Partial<LLMParams>;
    extractionLlmParams: Partial<LLMParams>;
    baseCredentials: ModelCredentials;
    baseExtractionCredentials?: ModelCredentials;
}

const buildLimescapeArgsForItem = (input: BuildArgsInput): LimescapeDocsArgs => {
    const {
        filePath,
        modelProvider,
        model,
        schema,
        processingOptions,
        extractionOptions,
        llmParams,
        extractionLlmParams,
        baseCredentials,
        baseExtractionCredentials,
    } = input;

    const args: LimescapeDocsArgs = {
        filePath,
        modelProvider,
        model,
        credentials: baseCredentials,
    } as LimescapeDocsArgs;

    if (schema) {
        args.schema = schema;
    }

    // Processing options
    const po = processingOptions;
    if (po.outputDir) args.outputDir = po.outputDir as string;
    if (po.tempDir) args.tempDir = po.tempDir as string;
    if (po.cleanup !== undefined) args.cleanup = po.cleanup as boolean;
    if (po.concurrency !== undefined) args.concurrency = Number(po.concurrency);
    if (po.correctOrientation !== undefined) args.correctOrientation = po.correctOrientation as boolean;
    if (po.directImageExtraction !== undefined) args.directImageExtraction = po.directImageExtraction as boolean;
    if (po.enableHybridExtraction !== undefined) args.enableHybridExtraction = po.enableHybridExtraction as boolean;
    if (po.extractOnly !== undefined) args.extractOnly = po.extractOnly as boolean;
    if (po.imageDensity !== undefined) args.imageDensity = Number(po.imageDensity);
    if (po.imageHeight !== undefined) args.imageHeight = Number(po.imageHeight);
    if (po.imageFormat) args.imageFormat = po.imageFormat as 'png' | 'jpeg';
    if (po.maintainFormat !== undefined) args.maintainFormat = po.maintainFormat as boolean;
    if (po.maxImageSize !== undefined) args.maxImageSize = Number(po.maxImageSize);
    if (po.maxRetries !== undefined) args.maxRetries = Number(po.maxRetries);
    if (po.maxTesseractWorkers !== undefined) args.maxTesseractWorkers = Number(po.maxTesseractWorkers);
    if (po.prompt) args.prompt = po.prompt as string;
    if (po.trimEdges !== undefined) args.trimEdges = po.trimEdges as boolean;

    const pagesToConvert = parsePages(po.pagesToConvertAsImages as string | undefined);
    if (pagesToConvert && pagesToConvert.length > 0) {
        args.pagesToConvertAsImages = pagesToConvert;
    }

    const extractPerPageStr = po.extractPerPage as string | undefined;
    if (extractPerPageStr) {
        const pages = extractPerPageStr
            .split(',')
            .map((p) => p.trim())
            .filter((p) => p.length > 0);
        if (pages.length > 0) args.extractPerPage = pages;
    }

    // Extraction options
    const eo = extractionOptions;
    if (eo.extractionModelProvider) {
        args.extractionModelProvider = eo.extractionModelProvider as LimescapeModelProvider;
    }
    const extractionModel = (eo.customExtractionModel as string) || (eo.extractionModel as string);
    if (extractionModel) {
        args.extractionModel = extractionModel;
    }
    if (eo.extractionPrompt) {
        args.extractionPrompt = eo.extractionPrompt as string;
    }
    if (baseExtractionCredentials) {
        args.extractionCredentials = baseExtractionCredentials;
    }

    // LLM params
    if (Object.keys(llmParams).length > 0) {
        args.llmParams = llmParams;
    }
    if (Object.keys(extractionLlmParams).length > 0) {
        args.extractionLlmParams = extractionLlmParams;
    }

    return args;
};


export class LimescapeDocs implements INodeType {
  description: INodeTypeDescription = {
      displayName: 'Limescape Docs',
      name: 'limescapeDocs',
      icon: 'file:limescape-logo-square.svg',
      group: ['transform'],
    version: [1.21],
      subtitle: '={{$parameter["operation"]}}',
      description: 'OCR & Document Extraction using AI models via Limescape Docs',
      defaults: {
          name: 'Limescape Docs',
      },
      // eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
      inputs: [
                {
                        displayName: 'Input Data',
                        type: 'main',
                        required: true
                }
        ],
      // Define only the main success output
      // eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
    outputs: [ { type: 'main' } ],
      credentials: [
          {
              name: 'limescapeDocsApi',
              required: true,
          }
      ],
      properties: [
          // Operation (kept simple as only one is defined)
          {
              displayName: 'Operation',
              name: 'operation',
              type: 'hidden',
              default: 'processDocument',
              // No hint needed for hidden fields
          },

          // --- Core Parameters ---
          // eslint-disable-next-line n8n-nodes-base/node-param-default-missing
          {
              displayName: 'Model Provider',
              name: 'modelProvider',
              type: 'options',
              options: [
                  { name: 'OpenAI', value: LimescapeModelProvider.OPENAI },
                  { name: 'Azure', value: LimescapeModelProvider.AZURE },
                  { name: 'Azure AI Foundry', value: LimescapeModelProvider.AZURE_AIF },
                  { name: 'Google (API Key)', value: LimescapeModelProvider.GOOGLE },
                  { name: 'Google Vertex', value: LimescapeModelProvider.VERTEX },
                  { name: 'AWS Bedrock', value: LimescapeModelProvider.BEDROCK },
              ],
              default: LimescapeModelProvider.OPENAI,
              required: true,
              description: 'The LLM provider to use for processing',
              hint: 'Select the AI provider (e.g., OpenAI). Default: OpenAI. Required field.',
          },
          {
              displayName: 'Model',
              name: 'model',
              type: 'options',
              // Alphabetized options
              options: [
                                { name: 'Claude 4 Haiku (Bedrock)', value: 'anthropic.claude-4-haiku-20250601-v1:0' },
                                { name: 'Claude 4 Opus (Bedrock)', value: 'anthropic.claude-4-opus-20250415-v1:0' },
                                { name: 'Claude 4 Sonnet (Bedrock)', value: 'anthropic.claude-4-sonnet-20250601-v1:0' },
                                { name: 'Claude 4.1 Haiku (Bedrock)', value: 'anthropic.claude-4.1-haiku-20250810-v1:0' },
                                { name: 'Claude 4.1 Opus (Bedrock)', value: 'anthropic.claude-4.1-opus-20250810-v1:0' },
                                { name: 'Claude 4.1 Sonnet (Bedrock)', value: 'anthropic.claude-4.1-sonnet-20250810-v1:0' },
                                { name: 'Claude 4.5 Haiku (Bedrock)', value: 'anthropic.claude-4.5-haiku-20251020-v1:0' },
                                { name: 'Claude 4.5 Sonnet (Bedrock)', value: 'anthropic.claude-4.5-sonnet-20250929-v1:0' },
                                { name: 'Gemini 2.5 Flash (Google)', value: 'gemini-2.5-flash' },
                                { name: 'Gemini 2.5 Flash Lite (Google)', value: 'gemini-2.5-flash-lite' },
                                { name: 'Gemini 2.5 Pro (Google)', value: 'gemini-2.5-pro' },
                                { name: 'Gemini 3 Pro Preview (Google)', value: 'gemini-3-pro-preview' },
                                { name: 'GPT-4.1 (OpenAI/Azure)', value: 'gpt-4.1' },
                                { name: 'GPT-4.1 Mini (OpenAI/Azure)', value: 'gpt-4.1-mini' },
                                { name: 'GPT-4o (OpenAI/Azure)', value: 'gpt-4o' },
                                { name: 'GPT-4o Mini (OpenAI/Azure)', value: 'gpt-4o-mini' },
                                { name: 'GPT-5.1 (OpenAI/Azure)', value: 'gpt-5.1' },
                                { name: 'GPT-5.1 Mini (OpenAI/Azure)', value: 'gpt-5.1-mini' },
                                { name: 'GPT-5.1 Standard (OpenAI/Azure)', value: 'gpt-5.1-standard' },
              ],
              default: 'gpt-5.1-standard',
              description: 'The specific model identifier for the selected provider',
              hint: 'Choose the AI model. Default: gpt-5.1-standard. Can be overridden by Custom Model.',
          },
          {
              displayName: 'Custom Model',
              name: 'customModel',
              type: 'string',
              default: '',
              description: 'Overrides the Model selection. Use the exact model identifier required by the provider/library.',
              placeholder: 'e.g., gpt-5.1 or specific Azure deployment ID',
              hint: 'Optional: Enter a specific model ID to override the Model selection. Leave empty to use the selected Model.',
          },
           {
              displayName: 'Schema (Optional)',
              name: 'schema',
              type: 'json',
              default: '{"type":"object","properties":{"pages":{"type":"array","description":"List of pages extracted from the document.","items":{"type":"object","properties":{"page_number":{"type":"integer","description":"The sequential number of the page."},"zones":{"type":"array","description":"List of distinct spatial zones (text blocks, tables, or images) found on this page.","items":{"type":"object","properties":{"type":{"type":"string","enum":["text_block","table","image","handwriting","header","footer"],"description":"The classification of the content in this zone."},"content_verbatim":{"type":"string","description":"For text/tables: The exact text found in this zone, preserving newlines and spacing. For images: null."},"image_description":{"type":"string","description":"For images: A detailed visual description of the image content. For text: null."},"position":{"type":"string","enum":["top_left","top_center","top_right","middle_left","center","middle_right","bottom_left","bottom_center","bottom_right"],"description":"The approximate spatial location of this zone on the page."},"confidence_score":{"type":"number","description":"A score between 0 and 1 indicating how confident the model is in the extraction."}},"required":["type","content_verbatim","position"]}}},"required":["page_number","zones"]}},"document_summary":{"type":"string","description":"A brief 2-3 sentence summary of what this entire document represents."}},"required":["pages","document_summary"]}',
              description: 'JSON schema for structured data extraction (if supported by model/prompt)',
              placeholder: '{\n  "type": "object",\n  "properties": {\n    "invoice_number": { "type": "string" }\n  }\n}',
              typeOptions: {
                  rows: 5, // Adjust editor size
              },
              hint: 'Optional: Provide a JSON schema for structured output. Default: {}.',
          },
          {
              displayName: 'Attachment Filter',
              name: 'attachmentFilter',
              type: 'collection',
              placeholder: 'Add filter',
              default: {},
              description: 'Filter which attachments to process based on file extension',
              hint: 'Optional: Define rules to include or exclude attachments based on their file extension.',
              options: [
                  {
                      displayName: 'Filter Mode',
                      name: 'filterMode',
                      type: 'options',
                      options: [
                          { name: 'Include (only Process These Extensions)', value: 'include' },
                          { name: 'Exclude (Skip These Extensions)', value: 'exclude' },
                      ],
                      default: 'include',
                      description: 'Choose whether to include or exclude the listed extensions',
                      hint: 'Select if the extensions list is for inclusion or exclusion. Default: include.',
                  },
                  {
                      displayName: 'Extensions',
                      name: 'extensions',
                      type: 'string',
                      default: 'pdf,doc,docx,odt,ott,rtf,txt,html,htm,xml,wps,wpd,xls,xlsx,ods,ots,csv,tsv,ppt,pptx,odp,otp,jpg,jpeg,png,heic',
                      description: 'Comma-separated file extensions to include or exclude (no dot, e.g. pdf, docx). You can enter any extension.',
                      hint: 'Enter comma-separated extensions (no dots). Default includes common document types.',
                  },
              ],
          },

          // --- Behavior ---
           {
              displayName: 'Input Binary Field',
              name: 'binaryPropertyName',
              type: 'string',
              default: 'data', // Add default value
              required: true,
              description: 'Name of the binary property in the input item containing the file data',
              hint: 'Specify the field name holding the file data in the input item. Default: data. Required field.',
          },

          // --- Optional Settings Grouped ---
          {
              displayName: 'Processing Options',
              name: 'processingOptions',
              type: 'collection',
              placeholder: 'Add Processing Option',
              default: {},
              description: 'Optional settings to control the OCR and document handling process',
              hint: 'Configure advanced OCR and document processing behaviors.',
              // Alphabetized options and fixed boolean descriptions
              options: [
                  { displayName: 'Cleanup Temp Files', name: 'cleanup', type: 'boolean', default: true, description: 'Whether Limescape Docs should clean up its temporary files', hint: 'Automatically delete temporary files after processing. Default: true.' },
                  { displayName: 'Concurrency', name: 'concurrency', type: 'number', default: 10, description: 'Internal concurrency limit for Limescape Docs operations', hint: 'Maximum parallel operations within the processor. Default: 10.' },
                  { displayName: 'Correct Orientation', name: 'correctOrientation', type: 'boolean', default: true, description: 'Whether to attempt to auto-correct document image orientation', hint: 'Try to fix rotated pages. Default: true.' },
                  { displayName: 'Direct Image Extraction', name: 'directImageExtraction', type: 'boolean', default: false, description: 'Whether to extract directly from images without full OCR (if applicable)', hint: 'Attempt extraction from images without OCR (faster but less accurate). Default: false.' },
                  { displayName: 'Enable Hybrid Extraction', name: 'enableHybridExtraction', type: 'boolean', default: false, description: 'Whether to use hybrid OCR/extraction methods (if applicable)', hint: 'Use combined OCR/extraction techniques if supported. Default: false.' },
                  { displayName: 'Extract Only', name: 'extractOnly', type: 'boolean', default: false, description: 'Whether to perform only extraction based on schema/prompt, assuming OCR is done or not needed', hint: 'Skip OCR and only perform extraction (useful if text is already available). Default: false.' },
                  { displayName: 'Extract Per Page', name: 'extractPerPage', type: 'string', default: '', description: 'Comma-separated page numbers/ranges for targeted extraction', hint: 'Specify pages/ranges (e.g., 1,3-5) for extraction. Default: empty (all pages).' },
                  { displayName: 'Image Density (DPI)', name: 'imageDensity', type: 'number', default: 150, description: 'Target DPI for image conversion during OCR', typeOptions: { minValue: 70 }, hint: 'Resolution for image conversion during OCR. Min: 70. Default: 150.' },
                  { displayName: 'Image Format', name: 'imageFormat', type: 'options', options: [ { name: 'PNG', value: 'png' }, { name: 'JPEG', value: 'jpeg' } ], default: 'png', description: 'Image format used for intermediate images during OCR', hint: 'Choose PNG or JPEG for intermediate image conversion. Default: PNG.' },
                  { displayName: 'Image Height (Pixels)', name: 'imageHeight', type: 'number', default: 3072, description: 'Target height for image resizing (preserves aspect ratio)', hint: 'Resize images to this height before processing. Default: 3072.' },
                  { displayName: 'Maintain Format', name: 'maintainFormat', type: 'boolean', default: false, description: 'Whether to attempt to preserve original document formatting in markdown output', hint: 'Try to keep original formatting in the Markdown output. Default: false.' },
                  { displayName: 'Max Image Size (MB)', name: 'maxImageSize', type: 'number', default: 15, description: 'Maximum size for individual images sent to the LLM', hint: 'Limit the size of images sent to the AI model. Default: 15 MB.' },
                  { displayName: 'Max Retries', name: 'maxRetries', type: 'number', default: 1, description: 'Maximum number of retries for failed LLM calls within Limescape Docs', hint: 'How many times to retry failed AI calls. Default: 1.' },
                  { displayName: 'Max Tesseract Workers', name: 'maxTesseractWorkers', type: 'number', default: -1, description: 'Max Tesseract workers (-1 for auto)', hint: 'Number of parallel Tesseract OCR processes. Default: -1 (auto-detect).' },
                  { displayName: 'Output Directory', name: 'outputDir', type: 'string', default: '', description: 'Directory to save intermediate/output files (optional, uses temp if empty)', hint: 'Optional: Save intermediate files here. Default: empty (uses system temp).' },
                  { displayName: 'Pages To Convert As Images', name: 'pagesToConvertAsImages', type: 'string', default: '', description: 'Comma-separated page numbers/ranges to force image conversion', hint: 'Force specific pages/ranges (e.g., 1,3-5) to be treated as images. Default: empty.' },
                  { displayName: 'Prompt', name: 'prompt', type: 'string', default: '', typeOptions: { rows: 4 }, description: 'Custom prompt to guide the LLM extraction/analysis', hint: 'Provide a custom prompt for the main AI processing step. Default: empty.' },
                  { displayName: 'Temporary Directory', name: 'tempDir', type: 'string', default: '', description: 'Directory for temporary processing files (optional, uses OS temp if empty)', hint: 'Optional: Specify a directory for temporary files. Default: empty (uses system temp).' },
                  { displayName: 'Trim Edges', name: 'trimEdges', type: 'boolean', default: true, description: 'Whether to attempt to trim whitespace/borders from document images', hint: 'Remove excess whitespace around page images. Default: true.' },
              ],
          },
          {
              displayName: 'Extraction Specifics',
              name: 'extractionOptions',
              type: 'collection',
              placeholder: 'Add Extraction Option',
              default: {},
              description: 'Optional settings specific to the extraction model/prompt, overriding main settings if provided',
              hint: 'Override model, provider, or prompt specifically for the extraction step.',
              options: [
                                     { displayName: 'Extraction Model Provider', name: 'extractionModelProvider', type: 'options', options: [
                                         { name: 'OpenAI', value: LimescapeModelProvider.OPENAI },
                                         { name: 'Azure', value: LimescapeModelProvider.AZURE },
                                         { name: 'Azure AI Foundry', value: LimescapeModelProvider.AZURE_AIF },
                                         { name: 'Google (API Key)', value: LimescapeModelProvider.GOOGLE },
                                         { name: 'Google Vertex', value: LimescapeModelProvider.VERTEX },
                                         { name: 'AWS Bedrock', value: LimescapeModelProvider.BEDROCK },
                                     ], default: '', description: 'Override provider for extraction step', hint: 'Optional: Select a different AI provider just for extraction. Default: empty (use main provider).' },
                                     { displayName: 'Extraction Model', name: 'extractionModel', type: 'options', options: [
                                         { name: 'Claude 4.5 Sonnet (Bedrock)', value: 'anthropic.claude-4.5-sonnet-20250929-v1:0' },
                                         { name: 'Gemini 2.5 Pro (Google)', value: 'gemini-2.5-pro' },
                                         { name: 'Gemini 3 Pro Preview (Google)', value: 'gemini-3-pro-preview' },
                                         { name: 'GPT-4o (OpenAI/Azure)', value: 'gpt-4o' },
                                         { name: 'GPT-5.1 (OpenAI/Azure)', value: 'gpt-5.1' },
                                     ], default: 'gpt-4o', description: 'Override model for extraction step', hint: 'Optional: Select a different AI model just for extraction. Default: gpt-4o.' },
                   { displayName: 'Custom Extraction Model', name: 'customExtractionModel', type: 'string', default: '', description: 'Override custom model for extraction step', hint: 'Optional: Enter a specific model ID to override the Extraction Model. Default: empty.' },
                   { displayName: 'Extraction Prompt', name: 'extractionPrompt', type: 'string', default: '', typeOptions: { rows: 4 }, description: 'Specific prompt for the extraction step', hint: 'Optional: Provide a prompt specifically for the extraction step. Default: empty (use main prompt or schema).' },
              ],
          },
          {
              displayName: 'LLM Parameters',
              name: 'llmParameters',
              type: 'collection',
              placeholder: 'Add LLM Parameter',
              default: {},
              description: 'Optional parameters to control the main LLM generation',
              hint: 'Fine-tune the behavior of the main AI model.',
              // Alphabetized options
              options: [
                  { displayName: 'Frequency Penalty', name: 'frequencyPenalty', type: 'number', typeOptions: { numberStepSize: 0.1 }, default: 0, description: 'Penalizes frequent tokens', hint: 'Discourage repeating the same tokens. Default: 0.' },
                  { displayName: 'Log Probabilities', name: 'logprobs', type: 'boolean', default: false, description: 'Whether to return log probabilities (if supported)', hint: 'Include token probabilities in the output (if model supports it). Default: false.' },
                  { displayName: 'Max Output Tokens', name: 'maxOutputTokens', type: 'number', default: 0, description: 'Max tokens for the generated output (e.g. Gemini)', hint: 'Primarily used by Google/Vertex Gemini models. 0 = library default.' },
                  { displayName: 'Max Tokens', name: 'maxTokens', type: 'number', default: 8192, description: 'Max tokens for the LLM response', typeOptions: { minValue: 1 }, hint: 'Maximum length of the AI response. Default: 8192.' },
                  { displayName: 'Presence Penalty', name: 'presencePenalty', type: 'number', typeOptions: { numberStepSize: 0.1 }, default: 0, description: 'Penalizes new tokens', hint: 'Discourage introducing new topics. Default: 0.' },
                  { displayName: 'Temperature', name: 'temperature', type: 'number', typeOptions: { numberStepSize: 0.1 }, default: 0.1, description: 'Controls randomness (0=deterministic)', hint: 'Higher values mean more creativity, lower means more focused. Default: 0.2.' },
                  { displayName: 'Top P', name: 'topP', type: 'number', typeOptions: { numberStepSize: 0.1 }, default: 1, description: 'Nucleus sampling parameter', hint: 'Alternative to temperature for controlling randomness. Default: 1.' },
              ],
          },
          {
              displayName: 'Gemini 3 Options',
              name: 'gemini3Options',
              type: 'collection',
              placeholder: 'Add Gemini 3 Option',
              default: {},
              description: 'Options specific to Google/Vertex Gemini 3 models',
              hint: 'Available only for Gemini 3 Pro Preview models.',
              displayOptions: {
                  show: {
                      modelProvider: [
                          LimescapeModelProvider.GOOGLE,
                          LimescapeModelProvider.VERTEX,
                      ],
                  },
              },
              options: [
                  {
                      displayName: 'Thinking Level',
                      name: 'thinkingLevel',
                      type: 'options',
                      options: [
                          { name: 'Low', value: 'low' },
                          { name: 'High', value: 'high' },
                      ],
                      default: 'low',
                      description: 'Controls depth of reasoning for Gemini 3 models',
                      hint: 'Applied only for Gemini 3 models; availability may vary by region/project.',
                  },
                  {
                      displayName: 'Media Resolution',
                      name: 'mediaResolution',
                      type: 'options',
                      options: [
                          { name: 'Low', value: 'low' },
                          { name: 'Medium', value: 'medium' },
                          { name: 'High', value: 'high' },
                      ],
                      default: 'medium',
                      description: 'Controls image resolution used by Gemini 3 models',
                      hint: 'Higher resolutions may improve OCR quality at higher cost.',
                  },
              ],
          },
           {
              displayName: 'Extraction LLM Parameters',
              name: 'extractionLlmParameters',
              type: 'collection',
              placeholder: 'Add Extraction LLM Parameter',
              default: {},
              description: 'Optional parameters to control the extraction LLM generation, overriding main LLM parameters',
              hint: 'Fine-tune the behavior of the extraction AI model, overriding main LLM parameters.',
              // Alphabetized options
              options: [
                    { displayName: 'Frequency Penalty', name: 'frequencyPenalty', type: 'number', typeOptions: { numberStepSize: 0.1 }, default: 0, hint: 'Extraction specific: Discourage repeating tokens. Default: 0.' },
                    { displayName: 'Log Probabilities', name: 'logprobs', type: 'boolean', default: false, hint: 'Extraction specific: Include token probabilities. Default: false.' },
                    { displayName: 'Max Output Tokens', name: 'maxOutputTokens', type: 'number', default: 0, hint: 'Extraction specific: Max generated tokens (e.g. Gemini). 0 = library default.' },
                    { displayName: 'Max Tokens', name: 'maxTokens', type: 'number', default: 8192, typeOptions: { minValue: 1 }, hint: 'Extraction specific: Max response length. Default: 8192.' },
                    { displayName: 'Presence Penalty', name: 'presencePenalty', type: 'number', typeOptions: { numberStepSize: 0.1 }, default: 0, hint: 'Extraction specific: Discourage new topics. Default: 0.' },
                    { displayName: 'Temperature', name: 'temperature', type: 'number', typeOptions: { numberStepSize: 0.1 }, default: 0.1, hint: 'Extraction specific: Controls randomness. Default: 0.1.' },
                    { displayName: 'Top P', name: 'topP', type: 'number', typeOptions: { numberStepSize: 0.1 }, default: 1, hint: 'Extraction specific: Nucleus sampling. Default: 1.' },
              ],
          },
      ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
      const items = this.getInputData();
      const successData: INodeExecutionData[] = [];

      // --- Aggregation Variables ---
      let aggregatedResults: {
          filenames: string[];
          filetypes: string[];
          markdown: string;
          completionTime: number;
          inputTokens: number;
          outputTokens: number;
          pagesProcessed: number;
          extractedData: any[];
          summaries: string[];
          processingIssues: string[];
      } = {
          filenames: [],
          filetypes: [],
          markdown: "",
          completionTime: 0,
          inputTokens: 0,
          outputTokens: 0,
          pagesProcessed: 0,
          extractedData: [],
          summaries: [],
          processingIssues: [],
      };
      let processedFileCount = 0;

      // --- Get Global Node Parameters ---
      const binaryPropertyName = this.getNodeParameter('binaryPropertyName', 0) as string;
    const globalModelProvider = this.getNodeParameter('modelProvider', 0) as LimescapeModelProvider;
      const globalModel = this.getNodeParameter('model', 0) as string;
      const globalCustomModel = this.getNodeParameter('customModel', 0, '') as string;
      const globalSchemaRaw = this.getNodeParameter('schema', 0, '') as string | object;
      const globalProcessingOptions = this.getNodeParameter('processingOptions', 0, {}) as IDataObject;
      const globalExtractionOptions = this.getNodeParameter('extractionOptions', 0, {}) as IDataObject;
      const globalLlmParameters = this.getNodeParameter('llmParameters', 0, {}) as IDataObject;
      const globalExtractionLlmParameters = this.getNodeParameter('extractionLlmParameters', 0, {}) as IDataObject;
    const globalGemini3Options = this.getNodeParameter('gemini3Options', 0, {}) as IDataObject;

      // --- Parameter Validation Safeguards ---
      // Validate maxTokens in both LLM Parameters and Extraction LLM Parameters
      const checkMaxTokens = (params: IDataObject, context: string) => {
        if (params && params.maxTokens !== undefined && params.maxTokens !== null) {
          const val = Number(params.maxTokens);
          if (isNaN(val) || val < 1024 || val > 16383) {
            throw new NodeOperationError(this.getNode(), `${context}: Max Tokens must be between 1024 and 16383.`, { itemIndex: -1 });
          }
        }
      };
      checkMaxTokens(globalLlmParameters, 'LLM Parameters');
      checkMaxTokens(globalExtractionLlmParameters, 'Extraction LLM Parameters');

      // Validate imageDensity in Processing Options
      if (globalProcessingOptions && globalProcessingOptions.imageDensity !== undefined) {
        const density = Number(globalProcessingOptions.imageDensity);
        if (
          globalProcessingOptions.imageDensity === null ||
          globalProcessingOptions.imageDensity === '' ||
          isNaN(density) ||
          density === 0 ||
          density < 70
        ) {
          throw new NodeOperationError(this.getNode(), 'Processing Options: Image Density (DPI) must be a number and at least 70.', { itemIndex: -1 });
        }
      }

      // --- Get Credentials ---
      const credentials = await this.getCredentials('limescapeDocsApi') as IDataObject;

      try {
          const baseModelCredentials = mapCredentialsForProvider(this, globalModelProvider, credentials);
          let baseExtractionCredentials: ModelCredentials | undefined;
          const extractionProvider = globalExtractionOptions.extractionModelProvider as LimescapeModelProvider | undefined;
          if (extractionProvider) {
              baseExtractionCredentials = mapCredentialsForProvider(this, extractionProvider, credentials);
          }

          // --- Parse Global Schema Once ---
          const globalSchema = parseSchema(this, globalSchemaRaw);

          // Build LLM params objects once
          const globalLlmParams = buildLLMParams(globalLlmParameters);
          const globalExtractionLlmParams = buildLLMParams(globalExtractionLlmParameters);

          // --- Process Each Item ---
          // Get attachment filter settings
          const attachmentFilter = this.getNodeParameter('attachmentFilter', 0, {}) as IDataObject;
          const filterMode = (attachmentFilter.filterMode as string) || 'include';
          const extensions = typeof attachmentFilter.extensions === 'string'
              ? attachmentFilter.extensions.split(',').map(e => e.trim().toLowerCase()).filter(e => !!e)
              : [];

          for (let i = 0; i < items.length; i++) {
              let tempFilePath: string | null = null;
              let currentFilename = `item_${i}_binary`; // Default filename
              let currentExtension = '';
              const item = items[i];

              // --- Attachment filter logic ---
              if (item.binary) {
                  const binaryData = item.binary[binaryPropertyName] as IBinaryData;
                  currentFilename = binaryData.fileName || currentFilename;
                  currentExtension = path.extname(currentFilename).substring(1).toLowerCase();
                  // Apply filter
                  const shouldProcess = filterMode === 'include'
                      ? extensions.includes(currentExtension)
                      : !extensions.includes(currentExtension);
                  if (!shouldProcess) {
                      aggregatedResults.processingIssues.push(`Skipped Item ${i} (${currentFilename}): Filtered out by attachment filter.`);
                      continue;
                  }
              }

              try {
                  // --- 1. Get Binary Data ---
                  if (!item.binary || !item.binary[binaryPropertyName]) {
                      throw new NodeOperationError(this.getNode(), `Missing binary data in property '${binaryPropertyName}' for item ${i}.`, { itemIndex: i });
                  }
                  const binaryData = item.binary[binaryPropertyName] as IBinaryData;
                  currentFilename = binaryData.fileName || currentFilename;
                  currentExtension = path.extname(currentFilename).substring(1).toLowerCase();

                  const fileBuffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);

                  // --- 2. Create Temporary File ---
                  const tempDir = (globalProcessingOptions.tempDir as string || os.tmpdir()).trim();
                  if (tempDir) {
                     ensureDirSync(tempDir);
                  }
                  tempFilePath = path.join(tempDir || os.tmpdir(), `n8n_limescape_docs_${Date.now()}_${i}_${path.basename(currentFilename)}`);
                  fs.writeFileSync(tempFilePath, fileBuffer);

                  // --- 3. Prepare LimescapeDocs arguments for this item ---
                  const effectiveModel = globalCustomModel || globalModel;
                    const limescapeArgs = buildLimescapeArgsForItem({
                    filePath: tempFilePath,
                    modelProvider: globalModelProvider,
                    model: effectiveModel,
                    schema: globalSchema,
                    processingOptions: globalProcessingOptions,
                    extractionOptions: globalExtractionOptions,
                    llmParams: globalLlmParams,
                    extractionLlmParams: globalExtractionLlmParams,
                    baseCredentials: baseModelCredentials,
                    baseExtractionCredentials,
                  });

                  const isGemini3Model = typeof effectiveModel === 'string' && effectiveModel.toLowerCase().startsWith('gemini-3');
                  // Gemini 3 specific options mapping
                  if (isGemini3Model && globalGemini3Options && Object.keys(globalGemini3Options).length > 0) {
                      limescapeArgs.googleOptions = limescapeArgs.googleOptions ?? {};
                      limescapeArgs.googleOptions.gemini3 = {};

                      if (typeof globalGemini3Options.thinkingLevel === 'string' && globalGemini3Options.thinkingLevel) {
                          limescapeArgs.googleOptions.gemini3.thinkingLevel = globalGemini3Options.thinkingLevel as 'low' | 'high';
                      }

                      if (typeof globalGemini3Options.mediaResolution === 'string' && globalGemini3Options.mediaResolution) {
                          limescapeArgs.googleOptions.gemini3.mediaResolution = globalGemini3Options.mediaResolution as 'low' | 'medium' | 'high';
                      }
                  }

                  // --- 4. Call Limescape Docs ---
                  const result = await limescapeDocs({ ...limescapeArgs, errorMode: LimescapeErrorMode.THROW });

                  // --- 5. Aggregate Successful Results ---
                   if (aggregatedResults.markdown.length > 0) { aggregatedResults.markdown += "\n\n---\n\n"; }
                   aggregatedResults.markdown += `### Attachment Start: ${currentFilename} (Type: ${currentExtension})\n\n`;

                   const markdownText = result.pages && Array.isArray(result.pages)
                      ? result.pages.map(page => page.content).join("\n\n")
                      : "[No page content returned]";

                  aggregatedResults.markdown += markdownText;
                  aggregatedResults.markdown += `\n\n### Attachment End: ${currentFilename}\n\n`;

                  aggregatedResults.filenames.push(currentFilename);
                  aggregatedResults.filetypes.push(currentExtension);
                  aggregatedResults.completionTime += (result.completionTime as number | undefined) || 0;
                  aggregatedResults.inputTokens += (result.inputTokens as number | undefined) || 0;
                  aggregatedResults.outputTokens += (result.outputTokens as number | undefined) || 0;
                  aggregatedResults.pagesProcessed += Array.isArray(result.pages) ? result.pages.length : 0;
                  if (result.extracted) aggregatedResults.extractedData.push(result.extracted);
                  if (result.summary) {
                      aggregatedResults.summaries.push(typeof result.summary === 'string' ? result.summary : JSON.stringify(result.summary));
                  }

                  processedFileCount++;

              } catch (error) {
                  // --- N8N error output handling ---
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  successData.push({
                      json: { message: errorMessage, itemIndex: i, file: currentFilename },
                      error: new NodeOperationError(this.getNode(), errorMessage, { itemIndex: i }),
                      itemIndex: i,
                  });
                  continue; // Continue to next item
              } finally {
                  // --- 6. Cleanup Temporary File ---
                  if (tempFilePath && fs.existsSync(tempFilePath)) {
                      try {
                          fs.unlinkSync(tempFilePath);
                      } catch (unlinkError) {
                          const errorMsg = `[Limescape Docs Node] Failed to delete temp file ${tempFilePath}: ${unlinkError instanceof Error ? unlinkError.message : String(unlinkError)}`;
                          console.error(errorMsg);
                          aggregatedResults.processingIssues.push(`Failed to delete temp file: ${path.basename(tempFilePath)}`);
                      }
                  }
              } // End of try...catch...finally for a single item
          } // --- End of loop ---
      } catch (error) {
           if (error instanceof NodeOperationError) throw error;
           throw new NodeOperationError(this.getNode(), `Failed to initialize Limescape Docs processing: ${error instanceof Error ? error.message : String(error)}`, { itemIndex: -1 });
      }

      // --- Final Aggregated Output ---
      if (processedFileCount > 0 || (aggregatedResults.processingIssues.length > 0 && processedFileCount === 0)) {
           const finalJsonOutput: IDataObject = {
              processedFiles: processedFileCount,
              filenames: aggregatedResults.filenames.join('; '),
              filetypes: aggregatedResults.filetypes.join('; '),
              markdown: aggregatedResults.markdown,
              totalCompletionTime: aggregatedResults.completionTime,
              totalInputTokens: aggregatedResults.inputTokens,
              totalOutputTokens: aggregatedResults.outputTokens,
              totalPagesProcessed: aggregatedResults.pagesProcessed,
              aggregatedExtracted: aggregatedResults.extractedData,
              aggregatedSummaries: aggregatedResults.summaries.join('\n---\n'),
              processingIssues: aggregatedResults.processingIssues,
          };
           successData.push({ json: finalJsonOutput });
      } else if (items.length > 0 && processedFileCount === 0 && aggregatedResults.processingIssues.length > 0) {
           successData.push({ json: { message: "All items resulted in errors.", processingIssues: aggregatedResults.processingIssues } });
      } else if (items.length === 0) {
           successData.push({ json: { message: "No input items received." } });
      }

      // Return only success data
      return [successData];
  }
}
