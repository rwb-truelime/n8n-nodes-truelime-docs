import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class LimescapeDocsApi implements ICredentialType {
    name = 'limescapeDocsApi';
    displayName = 'Limescape Docs Credentials API';
    documentationUrl = 'https://dev.azure.com/truelime/Team%20AI/_git/limescape-ai-limescape-docs';
    properties: INodeProperties[] = [
        // OpenAI
        {
            displayName: 'OpenAI API Key',
            name: 'openaiApiKey',
            type: 'string',
            typeOptions: { password: true },
            default: '',
            description: 'Your OpenAI API key (maps to credentials.apiKey when using ModelProvider.OPENAI)',
        },
        // Azure OpenAI (legacy)
        {
            displayName: 'Azure OpenAI API Key',
            name: 'azureApiKey',
            type: 'string',
            typeOptions: { password: true },
            default: '',
            description: 'Your Azure OpenAI API key (maps to credentials.apiKey when using ModelProvider.AZURE)',
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
            description: 'Optional Azure OpenAI API version override (maps to credentials.azureApiVersion)',
        },
        // Azure AI Foundry v1
        {
            displayName: 'Azure AI Foundry Base URL (Optional)',
            name: 'azureAifBaseUrl',
            type: 'string',
            default: '',
            placeholder: 'https://<deployment>.<region>.models.ai.azure.com/v1',
            description: 'Base URL for Azure AI Foundry v1 (maps to credentials.baseUrl when using ModelProvider.AZURE_AIF)',
        },
        {
            displayName: 'Azure AI Foundry API Key (Optional)',
            name: 'azureAifApiKey',
            type: 'string',
            typeOptions: { password: true },
            default: '',
            description: 'API key for Azure AI Foundry v1 (maps to credentials.apiKey when using ModelProvider.AZURE_AIF)',
        },
        // Google Gemini (direct Google GenAI)
        {
            displayName: 'Google Gemini API Key',
            name: 'googleApiKey',
            type: 'string',
            typeOptions: { password: true },
            default: '',
            description: 'Your Google GenAI (Gemini) API key (maps to credentials.apiKey when using ModelProvider.GOOGLE)',
        },
        // Google Vertex AI
        {
            displayName: 'Vertex Service Account JSON (Optional)',
            name: 'vertexServiceAccount',
            type: 'string',
            typeOptions: { password: true },
            default: '',
            description: 'Service account JSON string for Vertex AI (maps to credentials.serviceAccount when using ModelProvider.VERTEX)',
        },
        {
            displayName: 'Vertex Location (Optional)',
            name: 'vertexLocation',
            type: 'string',
            default: '',
            placeholder: 'europe-west1',
            description: 'Vertex AI region / location (maps to credentials.location for Vertex AI)',
        },
        // AWS Bedrock
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
            description: 'AWS Secret Access Key for Bedrock (maps to credentials.secretAccessKey)',
        },
        {
            displayName: 'AWS Bedrock Region',
            name: 'bedrockRegion',
            type: 'string',
            default: '',
            placeholder: 'us-east-1',
            description: 'AWS region for Bedrock (maps to credentials.region)',
        },
        {
            displayName: 'AWS Session Token (Optional)',
            name: 'bedrockSessionToken',
            type: 'string',
            typeOptions: { password: true },
            default: '',
            description: 'Optional AWS Session Token for temporary Bedrock credentials (maps to credentials.sessionToken)',
        },
    ];
}
