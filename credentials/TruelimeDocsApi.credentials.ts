import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class TruelimeDocsApi implements ICredentialType {
    name = 'truelimeDocsApi';
    displayName = 'Truelime Docs Credentials API';
    documentationUrl = 'https://github.com/truelime-dev/zerox-truelime';
    properties: INodeProperties[] = [
        // OpenAI
        {
            displayName: 'OpenAI API Key',
            name: 'openaiApiKey',
            type: 'string',
            typeOptions: { password: true },
            default: '',
            description: 'Your OpenAI API key',
        },
        // Azure
        {
            displayName: 'Azure API Key',
            name: 'azureApiKey',
            type: 'string',
            typeOptions: { password: true },
            default: '',
            description: 'Your Azure OpenAI API key',
        },
        {
            displayName: 'Azure Endpoint',
            name: 'azureEndpoint',
            type: 'string',
            default: '',
            placeholder: 'https://YOUR_RESOURCE_NAME.openai.azure.com/',
            description: 'Your Azure OpenAI endpoint URL',
        },
        // Google
        {
            displayName: 'Google API Key',
            name: 'googleApiKey',
            type: 'string',
            typeOptions: { password: true },
            default: '',
            description: 'Your Google AI (Gemini) API key',
        },
        // AWS Bedrock
        {
            displayName: 'AWS Access Key ID',
            name: 'bedrockAccessKeyId',
            type: 'string',
            typeOptions: { password: true },
            default: '',
            description: 'Your AWS Access Key ID for Bedrock',
        },
        {
            displayName: 'AWS Secret Access Key',
            name: 'bedrockSecretAccessKey',
            type: 'string',
            typeOptions: { password: true },
            default: '',
            description: 'Your AWS Secret Access Key for Bedrock',
        },
        {
            displayName: 'AWS Region',
            name: 'bedrockRegion',
            type: 'string',
            default: '',
            placeholder: 'us-east-1',
            description: 'The AWS region where your Bedrock models are hosted',
        },
        {
            displayName: 'AWS Session Token (Optional)',
            name: 'bedrockSessionToken',
            type: 'string',
            typeOptions: { password: true },
            default: '',
            description: 'Optional AWS Session Token (for temporary credentials)',
        },
    ];
}
