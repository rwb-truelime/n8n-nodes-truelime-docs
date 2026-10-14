import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type {
    IExecuteFunctions,
    INodeExecutionData,
    IDataObject,
    IBinaryData,
    INodeType,
    INodeTypeBaseDescription,
    INodeTypeDescription,
    ILoadOptionsFunctions,
    INodePropertyOptions,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import {
    limescapeDocs,
    LimescapeDocsArgs,
    ModelCredentials,
    LLMParams,
    ModelProvider as LimescapeModelProvider,
    ErrorMode as LimescapeErrorMode,
    ModelOptions,
    GeminiThinkingLevel,
    GeminiMediaResolution,
} from 'limescape-docs';

const GOOGLE_PROVIDERS: string[] = [LimescapeModelProvider.GOOGLE, LimescapeModelProvider.GEMINI_ENTERPRISE];
const LOGPROBS_PROVIDERS: string[] = [
    LimescapeModelProvider.OPENAI,
    LimescapeModelProvider.AZURE,
    LimescapeModelProvider.AZURE_AIF,
];

const PROVIDER_OPTIONS: INodePropertyOptions[] = [
    { name: 'OpenAI', value: LimescapeModelProvider.OPENAI },
    { name: 'Azure', value: LimescapeModelProvider.AZURE },
    { name: 'Azure AI Foundry', value: LimescapeModelProvider.AZURE_AIF },
    { name: 'Google (API Key)', value: LimescapeModelProvider.GOOGLE },
    { name: 'Google Gemini Enterprise', value: LimescapeModelProvider.GEMINI_ENTERPRISE },
    { name: 'AWS Bedrock', value: LimescapeModelProvider.BEDROCK },
];

// Model presets per provider. Values come from the library's ModelOptions enum so removed
// models surface as compile errors. Other models can still be used via the Custom Model field.
const GPT_MODELS: INodePropertyOptions[] = [
    { name: 'GPT-6 Astra', value: ModelOptions.OPENAI_GPT_6_ASTRA },
    { name: 'GPT-6 Sol', value: ModelOptions.OPENAI_GPT_6_SOL },
    { name: 'GPT-6 Luna', value: ModelOptions.OPENAI_GPT_6_LUNA },
];
const GEMINI_MODELS: INodePropertyOptions[] = [
    { name: 'Gemini 3.8 Flash', value: ModelOptions.GOOGLE_GEMINI_3_8_FLASH },
    { name: 'Gemini 3.1 Pro Preview', value: ModelOptions.GOOGLE_GEMINI_3_1_PRO_PREVIEW },
    { name: 'Gemini 3.5 Flash', value: ModelOptions.GOOGLE_GEMINI_3_5_FLASH },
    { name: 'Gemini 3.5 Flash-Lite', value: ModelOptions.GOOGLE_GEMINI_3_5_FLASH_LITE },
    { name: 'Gemini 3.1 Flash-Lite', value: ModelOptions.GOOGLE_GEMINI_3_1_FLASH_LITE },
];
const BEDROCK_MODELS: INodePropertyOptions[] = [
    { name: 'Claude Opus 5.5 (EU)', value: ModelOptions.BEDROCK_CLAUDE_OPUS_5_5_EU },
    { name: 'Claude Opus 5.5 (Global)', value: ModelOptions.BEDROCK_CLAUDE_OPUS_5_5_GLOBAL },
    { name: 'Claude Fable 5.1 (Global)', value: ModelOptions.BEDROCK_CLAUDE_FABLE_5_1_GLOBAL },
    { name: 'Claude Sonnet 5 (EU)', value: ModelOptions.BEDROCK_CLAUDE_SONNET_5_EU },
    { name: 'Claude Sonnet 5 (Global)', value: ModelOptions.BEDROCK_CLAUDE_SONNET_5_GLOBAL },
];

const modelsForProvider = (provider: string | undefined): INodePropertyOptions[] => {
    if (
        provider === LimescapeModelProvider.OPENAI ||
        provider === LimescapeModelProvider.AZURE ||
        provider === LimescapeModelProvider.AZURE_AIF
    ) {
        return GPT_MODELS;
    }
    if (provider && GOOGLE_PROVIDERS.includes(provider)) return GEMINI_MODELS;
    if (provider === LimescapeModelProvider.BEDROCK) return BEDROCK_MODELS;
    return [];
};

// Helper function to safely create a temporary directory if needed
const ensureDirSync = (dirPath: string) => {
    try {
        fs.mkdirSync(dirPath, { recursive: true });
    } catch (err: any) {
        if (err.code !== 'EEXIST') {
            throw err;
        }
    }
};

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

// Helper to build LLM params from n8n collection input. Drops keys the library rejects for
// the given provider (hidden fields keep their stored value when the provider changes).
const buildLLMParams = (input: IDataObject, provider: string): Partial<LLMParams> => {
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
    if (input.logprobs !== undefined && input.logprobs !== null && input.logprobs !== '') {
        params.logprobs = Boolean(input.logprobs);
    }

    if (!LOGPROBS_PROVIDERS.includes(provider)) {
        delete params.logprobs;
    }
    if (provider === LimescapeModelProvider.BEDROCK) {
        delete params.frequencyPenalty;
        delete params.presencePenalty;
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

    if (provider === LimescapeModelProvider.GEMINI_ENTERPRISE) {
        if (!credentials.geminiEnterpriseServiceAccount || !credentials.geminiEnterpriseLocation) {
            throw new NodeOperationError(
                node.getNode(),
                'Gemini Enterprise Service Account and Location are required when using Google Gemini Enterprise as the provider.',
                { itemIndex: -1 },
            );
        }
        return {
            serviceAccount: credentials.geminiEnterpriseServiceAccount as string,
            location: credentials.geminiEnterpriseLocation as string,
        } as ModelCredentials;
    }

    if (provider === LimescapeModelProvider.BEDROCK) {
        if (!credentials.bedrockRegion) {
            throw new NodeOperationError(node.getNode(), 'AWS Bedrock Region is required when using AWS Bedrock as the provider.', {
                itemIndex: -1,
            });
        }
        if (!credentials.bedrockApiKey && !credentials.bedrockAccessKeyId !== !credentials.bedrockSecretAccessKey) {
            throw new NodeOperationError(
                node.getNode(),
                'AWS Access Key ID and Secret Access Key must be set together (or use a Bedrock API Key, or leave all empty for the AWS default credential chain).',
                { itemIndex: -1 },
            );
        }
        return {
            apiKey: (credentials.bedrockApiKey as string | undefined) || undefined,
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
    if (po.extractPageByPage !== undefined) args.extractPageByPage = po.extractPageByPage as boolean;
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

    const extractPerPage = (po.extractPerPage as string[] | undefined)?.filter((k) => k.length > 0);
    if (extractPerPage && extractPerPage.length > 0) {
        args.extractPerPage = extractPerPage;
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

/**
 * Version description for LimescapeDocs V2 (limescape-docs 2.x)
 *
 * Light versioning (minor updates):
 * - Use a version array to list supported minor versions for this major implementation.
 * - Example: version: [2, 2.1]
 * - Use `@version` in displayOptions when you need minor-specific field behavior.
 *
 * Full versioning (major updates):
 * - The entry node maps versions to implementations via `nodeVersions`.
 * - Example: 2/2.1 → LimescapeDocsV2, 3 → LimescapeDocsV3.
 */
const versionDescription: INodeTypeDescription = {
    displayName: 'Limescape Docs',
    name: 'limescapeDocs',
    icon: 'file:limescape-logo-square.svg',
    group: ['transform'],
    version: [2],
    subtitle: '={{$parameter["operation"]}}',
    description: 'OCR & Document Extraction using AI models via Limescape Docs',
    defaults: {
        name: 'Limescape Docs',
    },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
        {
            name: 'limescapeDocsV2Api',
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
        },

        // --- Core Parameters ---
        // eslint-disable-next-line n8n-nodes-base/node-param-default-missing
        {
            displayName: 'Model Provider',
            name: 'modelProvider',
            type: 'options',
            options: PROVIDER_OPTIONS,
            default: LimescapeModelProvider.GEMINI_ENTERPRISE,
            required: true,
            description: 'The LLM provider to use for processing',
            hint: 'Select the AI provider. Default: Google Gemini Enterprise. Required field.',
        },
        {
            displayName: 'Extraction Provider',
            name: 'extractionProvider',
            type: 'hidden',
            default: '={{ ($parameter["extractionOptions"] && $parameter["extractionOptions"].extractionModelProvider) || $parameter["modelProvider"] }}',
        },
        {
            displayName: 'Uses Gemini',
            name: 'usesGemini',
            type: 'hidden',
            default: '={{ ["GOOGLE", "GEMINI_ENTERPRISE"].includes($parameter["modelProvider"]) || ["GOOGLE", "GEMINI_ENTERPRISE"].includes($parameter["extractionOptions"] && $parameter["extractionOptions"].extractionModelProvider) }}',
        },
        // eslint-disable-next-line n8n-nodes-base/node-param-default-missing
        {
            displayName: 'Model Name or ID',
            name: 'model',
            type: 'options',
            options: [],
            typeOptions: {
                loadOptionsMethod: 'getModelsForProvider',
                loadOptionsDependsOn: ['modelProvider'],
            },
            default: ModelOptions.GOOGLE_GEMINI_3_8_FLASH,
            description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
            hint: 'Filtered by provider. Can be overridden by Custom Model. Default: Gemini 3.8 Flash.',
        },
        {
            displayName: 'Custom Model',
            name: 'customModel',
            type: 'string',
            default: '',
            description: 'Overrides the Model selection. Use the exact model identifier required by the provider/library.',
            placeholder: 'e.g., gpt-6-sol or specific Azure deployment ID',
            hint: 'Optional: Enter a specific model ID to override the Model selection. Leave empty to use the selected Model.',
        },
        {
            displayName: 'Gemini Options',
            name: 'geminiOptions',
            type: 'collection',
            placeholder: 'Add Gemini Option',
            default: {},
            description: 'Options for Google Gemini models, applied to both the OCR and the extraction call',
            hint: 'Shown when the main or extraction provider is Google (API Key) or Google Gemini Enterprise.',
            displayOptions: {
                show: {
                    usesGemini: [true],
                },
            },
            options: [
                {
                    displayName: 'Thinking Level',
                    name: 'thinkingLevel',
                    type: 'options',
                    options: [
                        { name: 'Minimal', value: 'minimal' },
                        { name: 'Low', value: 'low' },
                        { name: 'Medium', value: 'medium' },
                        { name: 'High', value: 'high' },
                    ],
                    default: 'medium',
                    description: 'Controls depth of reasoning for Gemini models',
                    hint: 'Not every model supports every level; an unsupported level is rejected by the provider. Default: Medium.',
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
                    description: 'Controls image resolution used by Gemini models',
                    hint: 'Higher resolutions may improve OCR quality at higher cost. Default: Medium.',
                },
            ],
        },
        
        {
            displayName: 'Schema (Optional)',
            name: 'schema',
            type: 'json',
            default: '{"type":"object","properties":{"pages":{"type":"array","description":"List of pages extracted from the document.","items":{"type":"object","properties":{"page_number":{"type":"integer","description":"The sequential number of the page."},"zones":{"type":"array","description":"List of distinct spatial zones (text blocks, tables, or images) found on this page.","items":{"type":"object","properties":{"type":{"type":"string","enum":["text_block","table","image","handwriting","header","footer"],"description":"The classification of the content in this zone."},"content_verbatim":{"type":"string","description":"For text/tables: The exact text found in this zone, preserving newlines and spacing. For images: null."},"image_description":{"type":"string","description":"For images: A detailed visual description of the image content. For text: null."},"position":{"type":"string","enum":["top_left","top_center","top_right","middle_left","center","middle_right","bottom_left","bottom_center","bottom_right"],"description":"The approximate spatial location of this zone on the page."},"confidence_score":{"type":"number","description":"A score between 0 and 1 indicating how confident the model is in the extraction."}},"required":["type","content_verbatim","position"]}}},"required":["page_number","zones"]}},"document_summary":{"type":"string","description":"A brief 2-3 sentence summary of what this entire document represents."}},"required":["pages","document_summary"]}',
            description: 'JSON schema for structured data extraction (if supported by model/prompt)',
            placeholder: '{\n  "type": "object",\n  "properties": {\n    "invoice_number": { "type": "string" }\n  }\n}',
            typeOptions: {
                rows: 5,
            },
            hint: 'Optional: JSON schema for structured output. Default: an example schema that extracts page zones and a document summary. Clear it (or set {}) to run OCR only.',
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
            default: 'data',
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
            options: [
                { displayName: 'Cleanup Temp Files', name: 'cleanup', type: 'boolean', default: true, description: 'Whether Limescape Docs should clean up its temporary files', hint: 'Automatically delete temporary files after processing. Default: true.' },
                { displayName: 'Concurrency', name: 'concurrency', type: 'number', default: 10, description: 'Internal concurrency limit for Limescape Docs operations', hint: 'Maximum parallel operations within the processor. Default: 10.' },
                { displayName: 'Correct Orientation', name: 'correctOrientation', type: 'boolean', default: true, description: 'Whether to attempt to auto-correct document image orientation', hint: 'Try to fix rotated pages. Default: true.' },
                { displayName: 'Direct Image Extraction', name: 'directImageExtraction', type: 'boolean', default: false, description: 'Whether to extract directly from images without full OCR (if applicable)', hint: 'Attempt extraction from images without OCR (faster but less accurate). Default: false.' },
                { displayName: 'Enable Hybrid Extraction', name: 'enableHybridExtraction', type: 'boolean', default: false, description: 'Whether to use hybrid OCR/extraction methods (if applicable)', hint: 'Use combined OCR/extraction techniques if supported. Default: false.' },
                { displayName: 'Extract Only', name: 'extractOnly', type: 'boolean', default: false, description: 'Whether to perform only extraction based on schema/prompt, assuming OCR is done or not needed', hint: 'Skip OCR and only perform extraction (useful if text is already available). Default: false.' },
                {
                    displayName: 'Extract Page-by-Page',
                    name: 'extractPageByPage',
                    type: 'boolean',
                    default: false,
                    description: 'Whether to process each document page as a separate LLM extraction call. Prevents hallucination on large documents.',
                    hint: 'When enabled, aggregatedExtracted contains an array of per-page extraction objects instead of per-file. Results stored in pages[].extracted. Default: false.',
                },
                {
                    displayName: 'Extract Per Page Keys',
                    name: 'extractPerPage',
                    type: 'multiOptions',
                    default: [],
                    description: 'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
                    hint: 'Select schema property keys to extract per page. Only top-level keys supported. Nested properties are extracted as complete units.',
                    typeOptions: {
                        loadOptionsMethod: 'getSchemaPropertyKeys',
                        loadOptionsDependsOn: ['schema'],
                    },
                },
                { displayName: 'Image Density (DPI)', name: 'imageDensity', type: 'number', default: 150, description: 'Target DPI for image conversion during OCR', typeOptions: { minValue: 70 }, hint: 'Resolution for image conversion during OCR. Min: 70. The library caps it at 150, so higher values have no effect. Default: 150.' },
                { displayName: 'Image Format', name: 'imageFormat', type: 'options', options: [ { name: 'PNG', value: 'png' }, { name: 'JPEG', value: 'jpeg' } ], default: 'png', description: 'Image format used for intermediate images during OCR', hint: 'Choose PNG or JPEG for intermediate image conversion. Default: PNG.' },
                { displayName: 'Image Height (Pixels)', name: 'imageHeight', type: 'number', default: 2048, description: 'Target height for image resizing (preserves aspect ratio)', hint: 'Resize images to this height before processing. Default: 2048.' },
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
                { displayName: 'Extraction Model Provider', name: 'extractionModelProvider', type: 'options', options: PROVIDER_OPTIONS, default: '', description: 'Override provider for extraction step', hint: 'Optional: Select a different AI provider just for extraction. Default: empty (use main provider).' },
                { displayName: 'Extraction Model Name or ID', name: 'extractionModel', type: 'options', typeOptions: { loadOptionsMethod: 'getExtractionModelsForProvider', loadOptionsDependsOn: ['extractionOptions.extractionModelProvider', 'modelProvider'] }, default: '', description: 'Override model for extraction step. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.', hint: 'Optional: Filtered by the extraction provider (or the main provider). Default: empty (use main model).' },
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
            options: [
                { displayName: 'Frequency Penalty', name: 'frequencyPenalty', type: 'number', typeOptions: { numberStepSize: 0.1 }, default: 0, description: 'Penalizes frequent tokens', hint: 'Discourage repeating the same tokens. Not available for AWS Bedrock. Default: 0.', displayOptions: { hide: { '/modelProvider': [LimescapeModelProvider.BEDROCK] } } },
                { displayName: 'Log Probabilities', name: 'logprobs', type: 'boolean', default: false, description: 'Whether to return log probabilities (if supported)', hint: 'Include token probabilities in the output. OpenAI, Azure and Azure AI Foundry only. Default: false.', displayOptions: { show: { '/modelProvider': LOGPROBS_PROVIDERS } } },
                { displayName: 'Max Tokens', name: 'maxTokens', type: 'number', default: 16000, description: 'Max tokens for the LLM response', hint: 'Maximum length of the AI response. Check the model card for the supported maximum: the API rejects values the model does not support. Increase it if responses are cut off. Default: 16000.' },
                { displayName: 'Presence Penalty', name: 'presencePenalty', type: 'number', typeOptions: { numberStepSize: 0.1 }, default: 0, description: 'Penalizes new tokens', hint: 'Discourage introducing new topics. Not available for AWS Bedrock. Default: 0.', displayOptions: { hide: { '/modelProvider': [LimescapeModelProvider.BEDROCK] } } },
                { displayName: 'Temperature', name: 'temperature', type: 'number', typeOptions: { numberStepSize: 0.1 }, default: 0.1, description: 'Controls randomness (0=deterministic)', hint: 'Higher values mean more creativity, lower means more focused. Some models ignore it. Default: 0.1.', displayOptions: { hide: { '/modelProvider': GOOGLE_PROVIDERS } } },
                { displayName: 'Top P', name: 'topP', type: 'number', typeOptions: { numberStepSize: 0.1 }, default: 1, description: 'Nucleus sampling parameter', hint: 'Alternative to temperature for controlling randomness. Some models ignore it. Default: 1.', displayOptions: { hide: { '/modelProvider': GOOGLE_PROVIDERS } } },
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
            options: [
                { displayName: 'Frequency Penalty', name: 'frequencyPenalty', type: 'number', typeOptions: { numberStepSize: 0.1 }, default: 0, hint: 'Extraction specific: Discourage repeating tokens. Not available for AWS Bedrock. Default: 0.', displayOptions: { hide: { '/extractionProvider': [LimescapeModelProvider.BEDROCK] } } },
                { displayName: 'Log Probabilities', name: 'logprobs', type: 'boolean', default: false, hint: 'Extraction specific: Include token probabilities. OpenAI, Azure and Azure AI Foundry only. Default: false.', displayOptions: { show: { '/extractionProvider': LOGPROBS_PROVIDERS } } },
                { displayName: 'Max Tokens', name: 'maxTokens', type: 'number', default: 16000, hint: 'Extraction specific: Max response length. Check the model card for the supported maximum: the API rejects values the model does not support. Default: 16000.' },
                { displayName: 'Presence Penalty', name: 'presencePenalty', type: 'number', typeOptions: { numberStepSize: 0.1 }, default: 0, hint: 'Extraction specific: Discourage new topics. Not available for AWS Bedrock. Default: 0.', displayOptions: { hide: { '/extractionProvider': [LimescapeModelProvider.BEDROCK] } } },
                { displayName: 'Temperature', name: 'temperature', type: 'number', typeOptions: { numberStepSize: 0.1 }, default: 0.1, hint: 'Extraction specific: Controls randomness. Some models ignore it. Default: 0.1.', displayOptions: { hide: { '/extractionProvider': GOOGLE_PROVIDERS } } },
                { displayName: 'Top P', name: 'topP', type: 'number', typeOptions: { numberStepSize: 0.1 }, default: 1, hint: 'Extraction specific: Nucleus sampling. Some models ignore it. Default: 1.', displayOptions: { hide: { '/extractionProvider': GOOGLE_PROVIDERS } } },
            ],
        },
    ],
};

export class LimescapeDocsV2 implements INodeType {
    description: INodeTypeDescription;

    constructor(baseDescription: INodeTypeBaseDescription) {
        this.description = {
            ...baseDescription,
            ...versionDescription,
        };
    }

    methods = {
        loadOptions: {
            async getSchemaPropertyKeys(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
                const schemaRaw = this.getCurrentNodeParameter('schema') as string | undefined;

                if (!schemaRaw || typeof schemaRaw !== 'string') {
                    return [];
                }

                const trimmed = schemaRaw.trim();
                if (trimmed === '' || trimmed === '{}') {
                    return [];
                }

                try {
                    const schema = JSON.parse(trimmed);
                    if (!schema || typeof schema !== 'object' || !schema.properties) {
                        return [];
                    }

                    const properties = schema.properties as Record<string, { type?: string; description?: string }>;
                    const keys = Object.keys(properties);

                    if (keys.length === 0) {
                        return [];
                    }

                    return keys.map((key) => {
                        const prop = properties[key];
                        const typeStr = prop?.type || 'unknown';
                        const desc = prop?.description ? ` - ${prop.description.slice(0, 50)}${prop.description.length > 50 ? '...' : ''}` : '';
                        return {
                            name: `${key} (${typeStr})`,
                            value: key,
                            description: `Type: ${typeStr}${desc}`,
                        };
                    });
                } catch {
                    // Invalid JSON - return empty array, n8n will show "No options available"
                    return [];
                }
            },

            async getModelsForProvider(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
                const provider = this.getCurrentNodeParameter('modelProvider') as string;
                return modelsForProvider(provider);
            },

            async getExtractionModelsForProvider(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
                const extractionProvider = this.getCurrentNodeParameter('extractionOptions.extractionModelProvider') as string | undefined;
                const provider = extractionProvider || (this.getCurrentNodeParameter('modelProvider') as string);
                return modelsForProvider(provider);
            },
        },
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
            reasoningTokens: number;
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
            reasoningTokens: 0,
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
        const globalGeminiOptions = this.getNodeParameter('geminiOptions', 0, {}) as IDataObject;

        // --- Parameter Validation Safeguards ---
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
        const credentials = await this.getCredentials('limescapeDocsV2Api') as IDataObject;

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
            const effectiveExtractionProvider = extractionProvider || globalModelProvider;
            const globalLlmParams = buildLLMParams(globalLlmParameters, globalModelProvider);
            const globalExtractionLlmParams = buildLLMParams(globalExtractionLlmParameters, effectiveExtractionProvider);
            const usesGemini =
                GOOGLE_PROVIDERS.includes(globalModelProvider) || GOOGLE_PROVIDERS.includes(effectiveExtractionProvider);

            // --- Process Each Item ---
            // Get attachment filter settings
            const attachmentFilter = this.getNodeParameter('attachmentFilter', 0, {}) as IDataObject;
            const filterMode = (attachmentFilter.filterMode as string) || 'include';
            const extensions = typeof attachmentFilter.extensions === 'string'
                ? attachmentFilter.extensions.split(',').map(e => e.trim().toLowerCase()).filter(e => !!e)
                : [];

            for (let i = 0; i < items.length; i++) {
                let tempFilePath: string | null = null;
                let currentFilename = `item_${i}_binary`;
                let currentExtension = '';
                const item = items[i];

                // --- Attachment filter logic ---
                if (item.binary) {
                    const binaryData = item.binary[binaryPropertyName] as IBinaryData;
                    currentFilename = binaryData.fileName || currentFilename;
                    currentExtension = path.extname(currentFilename).substring(1).toLowerCase();
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

                    if (usesGemini && Object.keys(globalGeminiOptions).length > 0) {
                        limescapeArgs.googleOptions = limescapeArgs.googleOptions ?? {};

                        if (typeof globalGeminiOptions.thinkingLevel === 'string' && globalGeminiOptions.thinkingLevel) {
                            limescapeArgs.googleOptions.thinkingLevel = globalGeminiOptions.thinkingLevel as GeminiThinkingLevel;
                        }

                        if (typeof globalGeminiOptions.mediaResolution === 'string' && globalGeminiOptions.mediaResolution) {
                            limescapeArgs.googleOptions.mediaResolution = globalGeminiOptions.mediaResolution as GeminiMediaResolution;
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
                    aggregatedResults.reasoningTokens += (result.reasoningTokens as number | undefined) || 0;
                    aggregatedResults.pagesProcessed += Array.isArray(result.pages) ? result.pages.length : 0;

                    // Handle extraction results based on extractPageByPage mode
                    if (limescapeArgs.extractPageByPage && Array.isArray(result.pages)) {
                        // Per-page extraction: push each page's extracted data
                        for (const page of result.pages) {
                            if (page.extracted) {
                                aggregatedResults.extractedData.push(page.extracted);
                            }
                        }
                    } else if (result.extracted) {
                        // Standard extraction: push the full document extraction
                        aggregatedResults.extractedData.push(result.extracted);
                    }

                    if (result.summary) {
                        aggregatedResults.summaries.push(typeof result.summary === 'string' ? result.summary : JSON.stringify(result.summary));
                    }

                    processedFileCount++;

                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    successData.push({
                        json: { message: errorMessage, itemIndex: i, file: currentFilename },
                        error: new NodeOperationError(this.getNode(), errorMessage, { itemIndex: i }),
                        itemIndex: i,
                    });
                    continue;
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
                }
            }
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
                totalReasoningTokens: aggregatedResults.reasoningTokens,
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

        return [successData];
    }
}
