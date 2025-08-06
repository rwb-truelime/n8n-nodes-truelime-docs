import {
  INodeType,
  INodeTypeDescription,
  IExecuteFunctions,
  INodeExecutionData,
  IDataObject,
  NodeOperationError,
	NodeConnectionType,
  IBinaryData,
} from 'n8n-workflow';
import { zerox, ZeroxArgs, ModelCredentials, ErrorMode as ZeroxErrorMode, ModelProvider as ZeroxModelProvider } from 'limescape-docs-processor';
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

// Helper to parse comma-separated numbers/ranges (implement robustly if needed)
const parsePages = (pagesStr: string | undefined): number[] | number | undefined => {
  if (!pagesStr) return undefined;
  // Basic parsing - enhance for ranges (e.g., "1,3-5,7") if required by zerox
  const parts = pagesStr.split(',').map(p => p.trim()).filter(p => p);
  const numbers = parts.map(p => parseInt(p, 10)).filter(n => !isNaN(n));
  if (numbers.length === 0) return undefined; // Explicit return
  if (numbers.length === 1) return numbers[0];
  return numbers; // Explicit return
};


export class LimescapeDocs implements INodeType {
  description: INodeTypeDescription = {
      displayName: 'Limescape Docs',
      name: 'limescapeDocs',
      icon: 'file:limescape-logo-square.svg',
      group: ['transform'],
      version: 1,
      subtitle: '={{$parameter["operation"]}}',
      description: 'OCR & Document Extraction using vision models via Limescape Docs processing',
      defaults: {
          name: 'Limescape Docs',
      },
      // eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
      inputs: [
				{
						displayName: 'Input Data',
						type: NodeConnectionType.Main,
						required: true
				}
		],
      // Define only the main success output
      // eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
      outputs: [ { type: NodeConnectionType.Main } ],
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
                  { name: 'OpenAI', value: ZeroxModelProvider.OPENAI }, // Use Enum values
                  { name: 'Azure', value: ZeroxModelProvider.AZURE },
                  { name: 'Google', value: ZeroxModelProvider.GOOGLE },
                  { name: 'AWS Bedrock', value: ZeroxModelProvider.BEDROCK },
              ],
              default: ZeroxModelProvider.OPENAI, // Default is correctly set using Enum
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
									{ name: 'Claude 3 Haiku (Bedrock)', value: 'anthropic.claude-3-haiku-20240307-v1:0'},
									{ name: 'Claude 3.5 Sonnet (Bedrock)', value: 'anthropic.claude-3-5-sonnet-20240620-v1:0' },
									{ name: 'Gemini 1.5 Flash (Google)', value: 'gemini-1.5-flash' },
									{ name: 'Gemini 1.5 Pro (Google)', value: 'gemini-1.5-pro' },
									{ name: 'Gemini 2.5 Pro (Google)', value: 'gemini-2.5-pro' },
									{ name: 'GPT-4.1 (OpenAI/Azure)', value: 'gpt-4.1' },
									{ name: 'GPT-4.1 Mini (OpenAI/Azure)', value: 'gpt-4.1-mini' },
									{ name: 'GPT-4.1 Mini Standard (OpenAI/Azure)', value: 'gpt-4.1-mini-standard' },
									{ name: 'GPT-4.1 Standard (OpenAI/Azure)', value: 'gpt-4.1-standard' },
									{ name: 'GPT-4o (OpenAI/Azure)', value: 'gpt-4o' },
									{ name: 'GPT-4o Mini (OpenAI/Azure)', value: 'gpt-4o-mini' },
								],
								default: 'gpt-4.1-standard', // Set GPT-4.1 as default
              description: 'The specific model identifier for the selected provider',
              hint: 'Choose the AI model. Default: gpt-4.1-standard. Can be overridden by Custom Model.',
          },
          {
              displayName: 'Custom Model',
              name: 'customModel',
              type: 'string',
              default: '',
              description: 'Overrides the Model selection. Use the exact model identifier required by the provider/library.',
              placeholder: 'e.g., gpt-4-turbo or specific Azure deployment ID',
              hint: 'Optional: Enter a specific model ID to override the Model selection. Leave empty to use the selected Model.',
          },
           {
              displayName: 'Schema (Optional)',
              name: 'schema',
              type: 'json',
              default: '{}', // Set to empty object for best UX
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
                  { displayName: 'Cleanup Temp Files', name: 'cleanup', type: 'boolean', default: true, description: 'Whether zerox should clean up its temporary files', hint: 'Automatically delete temporary files after processing. Default: true.' },
                  { displayName: 'Concurrency', name: 'concurrency', type: 'number', default: 10, description: 'Internal concurrency limit for zerox operations', hint: 'Maximum parallel operations within the processor. Default: 10.' },
                  { displayName: 'Correct Orientation', name: 'correctOrientation', type: 'boolean', default: true, description: 'Whether to attempt to auto-correct document image orientation', hint: 'Try to fix rotated pages. Default: true.' },
                  { displayName: 'Direct Image Extraction', name: 'directImageExtraction', type: 'boolean', default: false, description: 'Whether to extract directly from images without full OCR (if applicable)', hint: 'Attempt extraction from images without OCR (faster but less accurate). Default: false.' },
                  { displayName: 'Enable Hybrid Extraction', name: 'enableHybridExtraction', type: 'boolean', default: false, description: 'Whether to use hybrid OCR/extraction methods (if applicable)', hint: 'Use combined OCR/extraction techniques if supported. Default: false.' },
                  { displayName: 'Extract Only', name: 'extractOnly', type: 'boolean', default: false, description: 'Whether to perform only extraction based on schema/prompt, assuming OCR is done or not needed', hint: 'Skip OCR and only perform extraction (useful if text is already available). Default: false.' },
                  { displayName: 'Extract Per Page', name: 'extractPerPage', type: 'string', default: '', description: 'Comma-separated page numbers/ranges for targeted extraction', hint: 'Specify pages/ranges (e.g., 1,3-5) for extraction. Default: empty (all pages).' },
                  { displayName: 'Image Density (DPI)', name: 'imageDensity', type: 'number', default: 150, description: 'Target DPI for image conversion during OCR', typeOptions: { minValue: 70 }, hint: 'Resolution for image conversion during OCR. Min: 70. Default: 150.' },
                  { displayName: 'Image Height (Pixels)', name: 'imageHeight', type: 'number', default: 3072, description: 'Target height for image resizing (preserves aspect ratio)', hint: 'Resize images to this height before processing. Default: 3072.' },
                  { displayName: 'Maintain Format', name: 'maintainFormat', type: 'boolean', default: false, description: 'Whether to attempt to preserve original document formatting in markdown output', hint: 'Try to keep original formatting in the Markdown output. Default: false.' },
                  { displayName: 'Max Image Size (MB)', name: 'maxImageSize', type: 'number', default: 15, description: 'Maximum size for individual images sent to the LLM', hint: 'Limit the size of images sent to the AI model. Default: 15 MB.' },
                  { displayName: 'Max Retries', name: 'maxRetries', type: 'number', default: 1, description: 'Maximum number of retries for failed LLM calls within zerox', hint: 'How many times to retry failed AI calls. Default: 1.' },
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
                  // Similar structure for extractionModelProvider, extractionModel, customExtractionModel, extractionPrompt
                   { displayName: 'Extraction Model Provider', name: 'extractionModelProvider', type: 'options', options: [ { name: 'OpenAI', value: ZeroxModelProvider.OPENAI }, /* ... add others */ ], default: '', description: 'Override provider for extraction step', hint: 'Optional: Select a different AI provider just for extraction. Default: empty (use main provider).' },
                   { displayName: 'Extraction Model', name: 'extractionModel', type: 'options', options: [ { name: 'GPT-4o', value: 'gpt-4o' }, /* ... add others */ ], default: 'gpt-4o', description: 'Override model for extraction step', hint: 'Optional: Select a different AI model just for extraction. Default: gpt-4o.' }, // Fix default value
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
                  { displayName: 'Max Tokens', name: 'maxTokens', type: 'number', default: 8192, description: 'Max tokens for the LLM response', typeOptions: { minValue: 1024, maxValue: 16383 }, hint: 'Maximum length of the AI response. Range: 1024-16383. Default: 8192.' },
                  { displayName: 'Presence Penalty', name: 'presencePenalty', type: 'number', typeOptions: { numberStepSize: 0.1 }, default: 0, description: 'Penalizes new tokens', hint: 'Discourage introducing new topics. Default: 0.' },
                  { displayName: 'Temperature', name: 'temperature', type: 'number', typeOptions: { numberStepSize: 0.1 }, default: 0.1, description: 'Controls randomness (0=deterministic)', hint: 'Higher values mean more creativity, lower means more focused. Default: 0.2.' },
                  { displayName: 'Top P', name: 'topP', type: 'number', typeOptions: { numberStepSize: 0.1 }, default: 1, description: 'Nucleus sampling parameter', hint: 'Alternative to temperature for controlling randomness. Default: 1.' },
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
                   { displayName: 'Max Tokens', name: 'maxTokens', type: 'number', default: 8192, typeOptions: { minValue: 1024, maxValue: 16383 }, hint: 'Extraction specific: Max response length. Range: 1024-16383. Default: 8192.' },
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
      const globalModelProvider = this.getNodeParameter('modelProvider', 0) as ZeroxModelProvider;
      const globalModel = this.getNodeParameter('model', 0) as string;
      const globalCustomModel = this.getNodeParameter('customModel', 0, '') as string;
      const globalSchemaRaw = this.getNodeParameter('schema', 0, '') as string | object;
      const globalProcessingOptions = this.getNodeParameter('processingOptions', 0, {}) as IDataObject;
      const globalExtractionOptions = this.getNodeParameter('extractionOptions', 0, {}) as IDataObject;
      const globalLlmParameters = this.getNodeParameter('llmParameters', 0, {}) as IDataObject;
      const globalExtractionLlmParameters = this.getNodeParameter('extractionLlmParameters', 0, {}) as IDataObject;

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

      // --- Prepare Base Credentials (using IDataObject for flexibility) ---
      const baseModelCredentials: IDataObject = {};
      let baseExtractionCredentials: IDataObject | undefined = undefined; // Initialize as undefined

      // Corrected mapCredentials function using IDataObject
      /**
       * Maps credentials for the selected provider only.
       * Throws a clear error if required credentials for the selected provider are missing.
       * Ignores credentials for other providers, even if present.
       */
      const mapCredentials = (provider: ZeroxModelProvider, targetCreds: IDataObject) => {
          if (provider === ZeroxModelProvider.OPENAI) {
              if (!credentials.openaiApiKey) {
                  throw new NodeOperationError(this.getNode(), 'OpenAI API Key is required when using OpenAI as the provider.', { itemIndex: -1 });
              }
              targetCreds.apiKey = credentials.openaiApiKey as string;
          } else if (provider === ZeroxModelProvider.AZURE) {
              if (!credentials.azureApiKey || !credentials.azureEndpoint) {
                  throw new NodeOperationError(this.getNode(), 'Azure API Key and Azure Endpoint are required when using Azure as the provider.', { itemIndex: -1 });
              }
              targetCreds.apiKey = credentials.azureApiKey as string;
              targetCreds.endpoint = credentials.azureEndpoint as string;
          } else if (provider === ZeroxModelProvider.GOOGLE) {
              if (!credentials.googleApiKey) {
                  throw new NodeOperationError(this.getNode(), 'Google API Key is required when using Google as the provider.', { itemIndex: -1 });
              }
              targetCreds.apiKey = credentials.googleApiKey as string;
          } else if (provider === ZeroxModelProvider.BEDROCK) {
              if (!credentials.bedrockAccessKeyId || !credentials.bedrockSecretAccessKey || !credentials.bedrockRegion) {
                  throw new NodeOperationError(this.getNode(), 'AWS Bedrock Access Key ID, Secret Key, and Region are required when using AWS Bedrock as the provider.', { itemIndex: -1 });
              }
              targetCreds.accessKeyId = credentials.bedrockAccessKeyId as string;
              targetCreds.secretAccessKey = credentials.bedrockSecretAccessKey as string;
              targetCreds.region = credentials.bedrockRegion as string;
              if (credentials.bedrockSessionToken) {
                  targetCreds.sessionToken = credentials.bedrockSessionToken as string;
              }
          } else {
              throw new NodeOperationError(this.getNode(), `Unsupported provider type in mapCredentials: ${provider}`, { itemIndex: -1 });
          }
      };

      try {
          mapCredentials(globalModelProvider, baseModelCredentials);
          // Prepare extraction credentials only if a provider is specified
          const extractionProvider = globalExtractionOptions.extractionModelProvider as ZeroxModelProvider | undefined;
          if (extractionProvider) {
              baseExtractionCredentials = {}; // Create the object only if needed
              mapCredentials(extractionProvider, baseExtractionCredentials);
          }
      } catch (error) {
           if (error instanceof NodeOperationError) throw error;
           throw new NodeOperationError(this.getNode(), `Failed to map credentials: ${error instanceof Error ? error.message : String(error)}`, { itemIndex: -1 });
      }

      // --- Parse Global Schema Once ---
      let globalSchema: Record<string, unknown> | undefined;
      if (globalSchemaRaw) {
          try {
              globalSchema = typeof globalSchemaRaw === 'string' && globalSchemaRaw.trim() !== ''
                  ? JSON.parse(globalSchemaRaw)
                  : (typeof globalSchemaRaw === 'object' ? globalSchemaRaw : undefined);
               if (typeof globalSchema !== 'object' || globalSchema === null) {
                   globalSchema = undefined; // Ensure it's undefined if parsing results in non-object
               }
          } catch (error) {
              throw new NodeOperationError(this.getNode(), `Invalid JSON schema provided: ${error instanceof Error ? error.message : String(error)}`, { itemIndex: -1 }); // Error before loop
          }
      }


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
              tempFilePath = path.join(tempDir || os.tmpdir(), `n8n_zerox_${Date.now()}_${i}_${path.basename(currentFilename)}`);
              fs.writeFileSync(tempFilePath, fileBuffer);

              // --- 3. Prepare Zerox Arguments for this item ---
              const zeroxArgs: ZeroxArgs = {
                  filePath: tempFilePath,
                  // APPLY FIX: Use double assertion as mapCredentials ensures the correct structure at runtime
                  credentials: baseModelCredentials as unknown as ModelCredentials,
                  model: globalCustomModel || globalModel,
                  modelProvider: globalModelProvider,
              };

              // Add optional parameters carefully
              if (globalProcessingOptions.outputDir) zeroxArgs.outputDir = globalProcessingOptions.outputDir as string;
              if (globalProcessingOptions.tempDir) zeroxArgs.tempDir = globalProcessingOptions.tempDir as string;
              if (globalProcessingOptions.cleanup !== undefined) zeroxArgs.cleanup = globalProcessingOptions.cleanup as boolean;
              if (globalProcessingOptions.concurrency !== undefined) zeroxArgs.concurrency = globalProcessingOptions.concurrency as number;
              if (globalProcessingOptions.correctOrientation !== undefined) zeroxArgs.correctOrientation = globalProcessingOptions.correctOrientation as boolean;
              if (globalProcessingOptions.directImageExtraction !== undefined) zeroxArgs.directImageExtraction = globalProcessingOptions.directImageExtraction as boolean;
              if (globalProcessingOptions.enableHybridExtraction !== undefined) zeroxArgs.enableHybridExtraction = globalProcessingOptions.enableHybridExtraction as boolean;
              if (globalProcessingOptions.extractOnly !== undefined) zeroxArgs.extractOnly = globalProcessingOptions.extractOnly as boolean;
              if (globalProcessingOptions.imageDensity !== undefined) zeroxArgs.imageDensity = globalProcessingOptions.imageDensity as number;
              if (globalProcessingOptions.imageHeight !== undefined) zeroxArgs.imageHeight = globalProcessingOptions.imageHeight as number;
              if (globalProcessingOptions.maintainFormat !== undefined) zeroxArgs.maintainFormat = globalProcessingOptions.maintainFormat as boolean;
              if (globalProcessingOptions.maxImageSize !== undefined) zeroxArgs.maxImageSize = globalProcessingOptions.maxImageSize as number;
              if (globalProcessingOptions.maxRetries !== undefined) zeroxArgs.maxRetries = globalProcessingOptions.maxRetries as number;
              if (globalProcessingOptions.maxTesseractWorkers !== undefined) zeroxArgs.maxTesseractWorkers = globalProcessingOptions.maxTesseractWorkers as number;
              if (globalProcessingOptions.prompt) zeroxArgs.prompt = globalProcessingOptions.prompt as string;
              if (globalProcessingOptions.trimEdges !== undefined) zeroxArgs.trimEdges = globalProcessingOptions.trimEdges as boolean;
              if (globalSchema) zeroxArgs.schema = globalSchema;

               const pagesToConvert = parsePages(globalProcessingOptions.pagesToConvertAsImages as string);
               if (pagesToConvert !== undefined) {
                   zeroxArgs.pagesToConvertAsImages = Array.isArray(pagesToConvert) ? pagesToConvert : [pagesToConvert];
               }

               const extractPerPageStr = globalProcessingOptions.extractPerPage as string;
               if (extractPerPageStr) {
                   const pages = extractPerPageStr.split(',').map(p => p.trim()).filter(p => p);
                   if (pages.length > 0) zeroxArgs.extractPerPage = pages;
               }

              // Add extraction options
              if (globalExtractionOptions.extractionModelProvider) zeroxArgs.extractionModelProvider = globalExtractionOptions.extractionModelProvider as ZeroxModelProvider;
              const extractionModel = (globalExtractionOptions.customExtractionModel as string) || (globalExtractionOptions.extractionModel as string);
              if (extractionModel) zeroxArgs.extractionModel = extractionModel;
              if (globalExtractionOptions.extractionPrompt) zeroxArgs.extractionPrompt = globalExtractionOptions.extractionPrompt as string;
              // APPLY FIX: Use double assertion as mapCredentials ensures the correct structure at runtime
              if (baseExtractionCredentials) zeroxArgs.extractionCredentials = baseExtractionCredentials as unknown as ModelCredentials;

              // Add LLM Params (handle potential empty objects)
              if (Object.keys(globalLlmParameters).length > 0) zeroxArgs.llmParams = globalLlmParameters as any;
              if (Object.keys(globalExtractionLlmParameters).length > 0) zeroxArgs.extractionLlmParams = globalExtractionLlmParameters as any;


              // --- 4. Call Zerox ---
              const result = await zerox({ ...zeroxArgs, errorMode: ZeroxErrorMode.THROW });

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
              aggregatedResults.completionTime += result.completionTime || 0;
              aggregatedResults.inputTokens += result.inputTokens || 0;
              aggregatedResults.outputTokens += result.outputTokens || 0;
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
                      const errorMsg = `[Zerox Node] Failed to delete temp file ${tempFilePath}: ${unlinkError instanceof Error ? unlinkError.message : String(unlinkError)}`;
                      console.error(errorMsg);
                      aggregatedResults.processingIssues.push(`Failed to delete temp file: ${path.basename(tempFilePath)}`);
                  }
              }
          } // End of try...catch...finally for a single item
      } // --- End of loop ---

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
