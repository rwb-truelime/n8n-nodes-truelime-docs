import {
  INodeType,
  INodeTypeDescription,
  IExecuteFunctions,
  INodeExecutionData,
  IDataObject,
  NodeOperationError,
  IBinaryData,
} from 'n8n-workflow';
import { zerox, ZeroxArgs, ModelCredentials, ErrorMode as ZeroxErrorMode, ModelProvider as ZeroxModelProvider } from 'truelime-zerox';
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


export class Zerox implements INodeType {
  description: INodeTypeDescription = {
      displayName: 'Truelime Docs',
      name: 'truelimeDocs', // Changed to camelCase as per convention
      icon: 'file:truelime-zwart.png', // Ensure this icon exists in the node's folder
      group: ['transform'],
      version: 1,
      subtitle: '={{$parameter["operation"]}}',
      description: 'OCR & Document Extraction using vision models via zerox-truelime',
      defaults: {
          name: 'Truelime Docs',
      },
      inputs: ['main'], // Standard way to define inputs/outputs
      outputs: ['main', 'main'], // Add error output
      outputNames: ['Success', 'Error'], // Naming the outputs
      credentials: [
          {
              name: 'zeroxApi', // Matches the name in ZeroxApi.credentials.ts
              required: true,
          },
      ],
      properties: [
          // Operation (kept simple as only one is defined)
          {
              displayName: 'Operation',
              name: 'operation',
              type: 'hidden', // Hidden as there's only one option currently
              default: 'processDocument',
          },

          // --- Core Parameters ---
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
              default: ZeroxModelProvider.OPENAI,
              required: true,
              description: 'The LLM provider to use for processing',
          },
          {
              displayName: 'Model',
              name: 'model',
              type: 'options', // Consider making this dynamic based on provider if possible, or keep extensive list
               options: [
                  // Add common models - this list can be extensive
                  { name: 'GPT-4o (OpenAI/Azure)', value: 'gpt-4o' },
                  { name: 'GPT-4o Mini (OpenAI/Azure)', value: 'gpt-4o-mini' },
                  { name: 'Claude 3.5 Sonnet (Bedrock)', value: 'anthropic.claude-3-5-sonnet-20240620-v1:0' },
                  { name: 'Claude 3 Haiku (Bedrock)', value: 'anthropic.claude-3-haiku-20240307-v1:0'},
                  { name: 'Gemini 1.5 Pro (Google)', value: 'gemini-1.5-pro-latest' }, // Use appropriate model IDs
                  { name: 'Gemini 1.5 Flash (Google)', value: 'gemini-1.5-flash-latest' },
                  // Add other relevant models...
              ],
              default: 'gpt-4o', // Sensible default
              description: 'The specific model identifier for the selected provider',
          },
          {
              displayName: 'Custom Model',
              name: 'customModel',
              type: 'string',
              default: '',
              description: 'Overrides the Model selection. Use the exact model identifier required by the provider/library.',
              placeholder: 'e.g., gpt-4-turbo or specific Azure deployment ID',
          },
           {
              displayName: 'Schema (Optional)',
              name: 'schema',
              type: 'json',
              default: '', // Default to empty string for optional JSON
              description: 'JSON schema for structured data extraction (if supported by model/prompt)',
              placeholder: '{\n  "type": "object",\n  "properties": {\n    "invoice_number": { "type": "string" }\n  }\n}',
              typeOptions: {
                  rows: 5, // Adjust editor size
              },
          },

          // --- Behavior ---
           {
              displayName: 'Error Mode',
              name: 'errorMode',
              type: 'options',
              options: [
                  { name: 'Throw Error (Fail Node)', value: ZeroxErrorMode.THROW }, // Use Enum values
                  { name: 'Ignore Error (Output Empty)', value: ZeroxErrorMode.IGNORE },
              ],
              default: ZeroxErrorMode.THROW,
              description: 'How the underlying zerox library should handle processing errors',
          },
           {
              displayName: 'Input Binary Field',
              name: 'binaryPropertyName',
              type: 'string',
              default: 'data',
              required: true,
              description: 'Name of the binary property in the input item containing the file data',
          },

          // --- Optional Settings Grouped ---
          {
              displayName: 'Processing Options',
              name: 'processingOptions',
              type: 'collection',
              placeholder: 'Add Processing Option',
              default: {},
              description: 'Optional settings to control the OCR and document handling process',
              options: [
                  { displayName: 'Output Directory', name: 'outputDir', type: 'string', default: '', description: 'Directory to save intermediate/output files (optional, uses temp if empty)' },
                  { displayName: 'Temporary Directory', name: 'tempDir', type: 'string', default: '', description: 'Directory for temporary processing files (optional, uses OS temp if empty)' },
                  { displayName: 'Cleanup Temp Files', name: 'cleanup', type: 'boolean', default: true, description: 'Whether zerox should clean up its temporary files' },
                  { displayName: 'Concurrency', name: 'concurrency', type: 'number', default: 10, description: 'Internal concurrency limit for zerox operations' },
                  { displayName: 'Correct Orientation', name: 'correctOrientation', type: 'boolean', default: true, description: 'Attempt to auto-correct document image orientation' },
                  { displayName: 'Direct Image Extraction', name: 'directImageExtraction', type: 'boolean', default: false, description: 'Extract directly from images without full OCR (if applicable)' },
                  { displayName: 'Enable Hybrid Extraction', name: 'enableHybridExtraction', type: 'boolean', default: false, description: 'Use hybrid OCR/extraction methods (if applicable)' },
                  { displayName: 'Extract Only', name: 'extractOnly', type: 'boolean', default: false, description: 'Perform only extraction based on schema/prompt, assuming OCR is done or not needed' },
                  { displayName: 'Extract Per Page', name: 'extractPerPage', type: 'string', default: '', description: 'Comma-separated page numbers/ranges for targeted extraction' },
                  { displayName: 'Image Density (DPI)', name: 'imageDensity', type: 'number', default: 300, description: 'Target DPI for image conversion during OCR' },
                  { displayName: 'Image Height (Pixels)', name: 'imageHeight', type: 'number', default: 1500, description: 'Target height for image resizing (preserves aspect ratio)' },
                  { displayName: 'Maintain Format', name: 'maintainFormat', type: 'boolean', default: false, description: 'Attempt to preserve original document formatting in markdown output' },
                  { displayName: 'Max Image Size (MB)', name: 'maxImageSize', type: 'number', default: 15, description: 'Maximum size for individual images sent to the LLM' },
                  { displayName: 'Max Retries', name: 'maxRetries', type: 'number', default: 1, description: 'Maximum number of retries for failed LLM calls within zerox' },
                  { displayName: 'Max Tesseract Workers', name: 'maxTesseractWorkers', type: 'number', default: -1, description: 'Max Tesseract workers (-1 for auto)' },
                  { displayName: 'Pages To Convert As Images', name: 'pagesToConvertAsImages', type: 'string', default: '', description: 'Comma-separated page numbers/ranges to force image conversion' },
                  { displayName: 'Prompt', name: 'prompt', type: 'string', default: '', typeOptions: { rows: 4 }, description: 'Custom prompt to guide the LLM extraction/analysis' },
                  { displayName: 'Trim Edges', name: 'trimEdges', type: 'boolean', default: true, description: 'Attempt to trim whitespace/borders from document images' },
              ],
          },
          {
              displayName: 'Extraction Specifics',
              name: 'extractionOptions',
              type: 'collection',
              placeholder: 'Add Extraction Option',
              default: {},
              description: 'Optional settings specific to the extraction model/prompt, overriding main settings if provided',
              options: [
                  // Similar structure for extractionModelProvider, extractionModel, customExtractionModel, extractionPrompt
                   { displayName: 'Extraction Model Provider', name: 'extractionModelProvider', type: 'options', options: [ { name: 'OpenAI', value: ZeroxModelProvider.OPENAI }, /* ... add others */ ], default: '', description: 'Override provider for extraction step' },
                   { displayName: 'Extraction Model', name: 'extractionModel', type: 'options', options: [ { name: 'GPT-4o', value: 'gpt-4o' }, /* ... add others */ ], default: '', description: 'Override model for extraction step' },
                   { displayName: 'Custom Extraction Model', name: 'customExtractionModel', type: 'string', default: '', description: 'Override custom model for extraction step' },
                   { displayName: 'Extraction Prompt', name: 'extractionPrompt', type: 'string', default: '', typeOptions: { rows: 4 }, description: 'Specific prompt for the extraction step' },
              ],
          },
          {
              displayName: 'LLM Parameters',
              name: 'llmParameters',
              type: 'collection',
              placeholder: 'Add LLM Parameter',
              default: {},
              description: 'Optional parameters to control the main LLM generation',
              options: [
                  { displayName: 'Temperature', name: 'temperature', type: 'number', typeOptions: { numberStepSize: 0.1 }, default: 0, description: 'Controls randomness (0=deterministic)' },
                  { displayName: 'Top P', name: 'topP', type: 'number', typeOptions: { numberStepSize: 0.1 }, default: 1, description: 'Nucleus sampling parameter' },
                  { displayName: 'Frequency Penalty', name: 'frequencyPenalty', type: 'number', typeOptions: { numberStepSize: 0.1 }, default: 0, description: 'Penalizes frequent tokens' },
                  { displayName: 'Presence Penalty', name: 'presencePenalty', type: 'number', typeOptions: { numberStepSize: 0.1 }, default: 0, description: 'Penalizes new tokens' },
                  { displayName: 'Max Tokens', name: 'maxTokens', type: 'number', default: 4096, description: 'Max tokens for the LLM response' },
                  { displayName: 'Log Probabilities', name: 'logprobs', type: 'boolean', default: false, description: 'Whether to return log probabilities (if supported)' },
              ],
          },
           {
              displayName: 'Extraction LLM Parameters',
              name: 'extractionLlmParameters',
              type: 'collection',
              placeholder: 'Add Extraction LLM Parameter',
              default: {},
              description: 'Optional parameters to control the extraction LLM generation, overriding main LLM parameters',
              options: [
                   // Similar structure for temperature, topP, etc. specific to extraction
                   { displayName: 'Temperature', name: 'temperature', type: 'number', typeOptions: { numberStepSize: 0.1 }, default: 0 },
                   { displayName: 'Top P', name: 'topP', type: 'number', typeOptions: { numberStepSize: 0.1 }, default: 1 },
                   { displayName: 'Frequency Penalty', name: 'frequencyPenalty', type: 'number', typeOptions: { numberStepSize: 0.1 }, default: 0 },
                   { displayName: 'Presence Penalty', name: 'presencePenalty', type: 'number', typeOptions: { numberStepSize: 0.1 }, default: 0 },
                   { displayName: 'Max Tokens', name: 'maxTokens', type: 'number', default: 4096 },
                   { displayName: 'Log Probabilities', name: 'logprobs', type: 'boolean', default: false },
              ],
          },
      ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
      const items = this.getInputData();
      const successData: INodeExecutionData[] = [];
      const errorData: INodeExecutionData[] = [];

      // --- Aggregation Variables (Declare before loop) ---
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
      const globalErrorMode = this.getNodeParameter('errorMode', 0) as ZeroxErrorMode;
      const globalSchemaRaw = this.getNodeParameter('schema', 0, '') as string | object;
      const globalProcessingOptions = this.getNodeParameter('processingOptions', 0, {}) as IDataObject;
      const globalExtractionOptions = this.getNodeParameter('extractionOptions', 0, {}) as IDataObject;
      const globalLlmParameters = this.getNodeParameter('llmParameters', 0, {}) as IDataObject;
      const globalExtractionLlmParameters = this.getNodeParameter('extractionLlmParameters', 0, {}) as IDataObject;

      // --- Get Credentials ---
      const credentials = await this.getCredentials('zeroxApi') as IDataObject;

      // --- Prepare Base Credentials (using IDataObject for flexibility) ---
      const baseModelCredentials: IDataObject = {};
      let baseExtractionCredentials: IDataObject | undefined = undefined; // Initialize as undefined

      // Corrected mapCredentials function using IDataObject
      const mapCredentials = (provider: ZeroxModelProvider, targetCreds: IDataObject) => {
          if (provider === ZeroxModelProvider.OPENAI) {
              if (!credentials.openaiApiKey) throw new NodeOperationError(this.getNode(), 'OpenAI API Key missing in credentials.', { itemIndex: -1 });
              targetCreds.apiKey = credentials.openaiApiKey as string;
          } else if (provider === ZeroxModelProvider.AZURE) {
               if (!credentials.azureApiKey || !credentials.azureEndpoint) throw new NodeOperationError(this.getNode(), 'Azure API Key or Endpoint missing in credentials.', { itemIndex: -1 });
              targetCreds.apiKey = credentials.azureApiKey as string;
              targetCreds.endpoint = credentials.azureEndpoint as string;
          } else if (provider === ZeroxModelProvider.GOOGLE) {
               if (!credentials.googleApiKey) throw new NodeOperationError(this.getNode(), 'Google API Key missing in credentials.', { itemIndex: -1 });
              targetCreds.apiKey = credentials.googleApiKey as string;
          } else if (provider === ZeroxModelProvider.BEDROCK) {
               if (!credentials.bedrockAccessKeyId || !credentials.bedrockSecretAccessKey || !credentials.bedrockRegion) throw new NodeOperationError(this.getNode(), 'AWS Bedrock Access Key ID, Secret Key, or Region missing in credentials.', { itemIndex: -1 });
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
      for (let i = 0; i < items.length; i++) {
          let tempFilePath: string | null = null;
          let currentFilename = `item_${i}_binary`; // Default filename
          let currentExtension = '';
          const item = items[i];

          try {
              // --- 1. Get Binary Data ---
              if (!item.binary || !item.binary[binaryPropertyName]) {
                  const msg = `Skipping item ${i}: No binary data found in property '${binaryPropertyName}'.`;
                  aggregatedResults.processingIssues.push(msg);
                  if (this.continueOnFail()) {
                       errorData.push({ json: { error: msg, details: 'Missing binary data' }, pairedItem: { item: i } });
                       continue;
                  } else {
                      throw new NodeOperationError(this.getNode(), msg, { itemIndex: i });
                  }
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
                  errorMode: globalErrorMode,
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
               if (pagesToConvert !== undefined) zeroxArgs.pagesToConvertAsImages = pagesToConvert;

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
              const result = await zerox(zeroxArgs);

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
              const errorMessage = error instanceof Error ? error.message : String(error);
              aggregatedResults.processingIssues.push(`Item ${i} (${currentFilename || 'unknown'}) Error: ${errorMessage}`);

              if (this.continueOnFail()) {
                  errorData.push({ json: { error: errorMessage, filename: currentFilename, itemIndex: i }, pairedItem: { item: i } });
                  // Loop continues automatically
              } else {
                  if (error instanceof NodeOperationError) {
                      throw error;
                  } else {
                      throw new NodeOperationError(this.getNode(), `Error processing item ${i} (${currentFilename || 'unknown'}): ${errorMessage}`, { itemIndex: i });
                  }
              }
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
      } else if (items.length > 0 && processedFileCount === 0 && errorData.length === 0 && aggregatedResults.processingIssues.length === 0) {
           successData.push({ json: { message: "No files were processed or resulted in errors.", processingIssues: aggregatedResults.processingIssues } });
      } else if (items.length === 0) {
           successData.push({ json: { message: "No input items received." } });
      }

      // Return data for both success and error outputs
      return [successData, errorData];
  }
}
