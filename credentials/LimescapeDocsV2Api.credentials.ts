import { ICredentialType, INodeProperties } from 'n8n-workflow';

/**
 * Credentials for Limescape Docs node V2 (limescape-docs 2.x).
 * V1 keeps using `limescapeDocsApi`; drop that credential together with V1.
 */
export class LimescapeDocsV2Api implements ICredentialType {
    name = 'limescapeDocsV2Api';
    displayName = 'Limescape Docs V2 Credentials API';
    documentationUrl = 'https://dev.azure.com/truelime/Team%20AI/_git/limescape-ai-limescape-docs';
    properties: INodeProperties[] = [
        // OpenAI
        {
            displayName: 'OpenAI',
            name: 'openaiNotice',
            type: 'notice',
            default: '',
        },
        {
            displayName: 'OpenAI API Key',
            name: 'openaiApiKey',
            type: 'string',
            typeOptions: { password: true },
            default: '',
            description:
                'Your OpenAI API key (maps to credentials.apiKey when using ModelProvider.OPENAI)',
        },
        // Azure OpenAI
        {
            displayName: 'Azure OpenAI',
            name: 'azureNotice',
            type: 'notice',
            default: '',
        },
        {
            displayName: 'Azure OpenAI API Key',
            name: 'azureApiKey',
            type: 'string',
            typeOptions: { password: true },
            default: '',
            description:
                'Your Azure OpenAI API key (maps to credentials.apiKey when using ModelProvider.AZURE)',
        },
        {
            displayName: 'Azure OpenAI Endpoint',
            name: 'azureEndpoint',
            type: 'string',
            default: '',
            placeholder: 'https://YOUR_RESOURCE_NAME.openai.azure.com/',
            description: 'Your Azure OpenAI endpoint URL (maps to credentials.endpoint)',
        },
        {
            displayName: 'Azure OpenAI API Version (Optional)',
            name: 'azureApiVersion',
            type: 'string',
            default: '',
            placeholder: '2024-10-21',
            description:
                'Optional Azure OpenAI API version override (maps to credentials.azureApiVersion)',
        },
        // Azure AI Foundry v1
        {
            displayName: 'Azure AI Foundry',
            name: 'azureAifNotice',
            type: 'notice',
            default: '',
        },
        {
            displayName: 'Azure AI Foundry Base URL (Optional)',
            name: 'azureAifBaseUrl',
            type: 'string',
            default: '',
            placeholder: 'https://<deployment>.<region>.models.ai.azure.com/v1',
            description:
                'Base URL for Azure AI Foundry v1 (maps to credentials.baseURL when using ModelProvider.AZURE_AIF)',
        },
        {
            displayName: 'Azure AI Foundry API Key (Optional)',
            name: 'azureAifApiKey',
            type: 'string',
            typeOptions: { password: true },
            default: '',
            description:
                'API key for Azure AI Foundry v1 (maps to credentials.apiKey when using ModelProvider.AZURE_AIF)',
        },
        // Google Gemini (direct Google GenAI)
        {
            displayName: 'Google Gemini',
            name: 'googleNotice',
            type: 'notice',
            default: '',
        },
        {
            displayName: 'Google Gemini API Key',
            name: 'googleApiKey',
            type: 'string',
            typeOptions: { password: true },
            default: '',
            description:
                'Your Google GenAI (Gemini) API key (maps to credentials.apiKey when using ModelProvider.GOOGLE)',
        },
        // Google Gemini Enterprise
        {
            displayName: 'Google Gemini Enterprise',
            name: 'geminiEnterpriseNotice',
            type: 'notice',
            default: '',
        },
        {
            displayName: 'Gemini Enterprise Service Account JSON (Optional)',
            name: 'geminiEnterpriseServiceAccount',
            type: 'string',
            typeOptions: { password: true },
            default: '',
            description:
                'Service account JSON string for Gemini Enterprise (maps to credentials.serviceAccount when using ModelProvider.GEMINI_ENTERPRISE)',
        },
        {
            displayName: 'Gemini Enterprise Location (Optional)',
            name: 'geminiEnterpriseLocation',
            type: 'string',
            default: '',
            placeholder: 'global',
            description:
                'Gemini Enterprise location (maps to credentials.location). Use "global" or "eu" for Gemini 3.8 Flash; Gemini 3.1 Pro requires "global".',
        },
        // AWS Bedrock
        {
            displayName: 'AWS Bedrock',
            name: 'bedrockNotice',
            type: 'notice',
            default: '',
        },
        {
            displayName: 'AWS Bedrock Region',
            name: 'bedrockRegion',
            type: 'string',
            default: '',
            placeholder: 'eu-central-1',
            description: 'AWS region for Bedrock (maps to credentials.region). Required for Bedrock.',
        },
        {
            displayName: 'AWS Bedrock API Key (Optional)',
            name: 'bedrockApiKey',
            type: 'string',
            typeOptions: { password: true },
            default: '',
            description:
                'Bedrock API key, sent as a bearer token (maps to credentials.apiKey). Takes precedence over the access keys below; if neither is set, the AWS SDK default credential chain is used.',
        },
        {
            displayName: 'AWS Access Key ID (Optional)',
            name: 'bedrockAccessKeyId',
            type: 'string',
            typeOptions: { password: true },
            default: '',
            description: 'AWS Access Key ID for Bedrock (maps to credentials.accessKeyId)',
        },
        {
            displayName: 'AWS Secret Access Key (Optional)',
            name: 'bedrockSecretAccessKey',
            type: 'string',
            typeOptions: { password: true },
            default: '',
            description:
                'AWS Secret Access Key for Bedrock (maps to credentials.secretAccessKey)',
        },
        {
            displayName: 'AWS Session Token (Optional)',
            name: 'bedrockSessionToken',
            type: 'string',
            typeOptions: { password: true },
            default: '',
            description:
                'Optional AWS Session Token for temporary Bedrock credentials (maps to credentials.sessionToken)',
        },
    ];
}
