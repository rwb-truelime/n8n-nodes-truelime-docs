# Comprehensive Guide to Building Custom Nodes for N8N

## Table of Contents

1. [Introduction](#introduction)
2. [Planning Phase](#planning-phase)
   - [Overview of N8N Node Development](#overview-of-n8n-node-development)
   - [Node Types: Trigger vs Action Nodes](#node-types-trigger-vs-action-nodes)
   - [Choosing Your Node Building Approach](#choosing-your-node-building-approach)
   - [Node UI Design Principles](#node-ui-design-principles)
   - [Planning Your Node Structure](#planning-your-node-structure)
3. [Development Phase](#development-phase)
   - [Setting Up the Development Environment](#setting-up-the-development-environment)
   - [Creating the Node Structure](#creating-the-node-structure)
   - [Implementing Programmatic-Style Nodes](#implementing-programmatic-style-nodes)
   - [Handling Credentials](#handling-credentials)
   - [Building the Node UI](#building-the-node-ui)
   - [Error Handling](#error-handling)
4. [Testing Phase](#testing-phase)
   - [Running Nodes Locally](#running-nodes-locally)
   - [Using the Node Linter](#using-the-node-linter)
   - [Troubleshooting Common Issues](#troubleshooting-common-issues)
   - [Debugging Techniques](#debugging-techniques)
5. [Deployment Phase](#deployment-phase)
   - [Packaging Your Node](#packaging-your-node)
   - [Publishing Your Node](#publishing-your-node)
   - [Sharing with the Community](#sharing-with-the-community)
   - [Maintaining Your Node](#maintaining-your-node)
6. [Code Examples](#code-examples)
   - [Complete Programmatic-Style Node Example](#complete-programmatic-style-node-example)
   - [Credentials Implementation](#credentials-implementation)
   - [UI Elements Implementation](#ui-elements-implementation)
   - [API Integration Examples](#api-integration-examples)
7. [Reference Materials](#reference-materials)

## Introduction

This comprehensive guide provides detailed instructions for building custom nodes for N8N. It covers the entire development lifecycle from planning to deployment, with a special focus on creating Action Nodes using the Programmatic style.

N8N is a workflow automation tool that allows you to connect different services and automate tasks. Custom nodes extend N8N's functionality by integrating with additional services or providing specialized operations.

This guide assumes the following prerequisites:

- Some familiarity with JavaScript and TypeScript
- Ability to manage your own development environment, including git
- Knowledge of npm, including creating and submitting packages
- Familiarity with N8N, including a good understanding of data structures and item linking

## Planning Phase

### Overview of N8N Node Development

N8N nodes are the building blocks of workflows. Each node represents an integration with a service or a specific operation. When building a custom node, you're essentially creating a bridge between N8N and an external service or implementing custom functionality.

Nodes in N8N are written in TypeScript and follow a specific structure. They consist of several files that define their appearance, behavior, and integration capabilities.

### Node Types: Trigger vs Action Nodes

There are two main types of nodes you can build for N8N:

#### Trigger Nodes

Trigger nodes start a workflow and supply the initial data. A workflow can contain multiple trigger nodes, but with each execution, only one of them will execute, depending on the triggering event.

There are three types of trigger nodes in N8N:

| Type    | Description                                                                                                                                 | Example Nodes                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Webhook | Nodes for services that support webhooks. These nodes listen for events and trigger workflows in real time.                                 | Zendesk Trigger, Telegram Trigger, Brevo Trigger                                     |
| Polling | Nodes for services that don't support webhooks. These nodes periodically check for new data, triggering workflows when they detect updates. | Airtable Trigger, Gmail Trigger, Google Sheet Trigger, RssFeed Read Trigger          |
| Others  | Nodes that handle real-time responses not related to HTTP requests or polling. This includes message queue nodes and time-based triggers.   | AMQP Trigger, RabbitMQ Trigger, MQTT Trigger, Schedule Trigger, Email Trigger (IMAP) |

#### Action Nodes

Action nodes perform operations as part of your workflow. These can include manipulating data and triggering events in other systems. Action nodes are executed when the workflow reaches them and typically process the data received from previous nodes.

### Choosing Your Node Building Approach

N8N has two node-building styles: declarative and programmatic.

#### Declarative Style

You should use the declarative style for most nodes. This style:

- Uses a JSON-based syntax, making it simpler to write, with less risk of introducing bugs
- Is more future-proof
- Supports integration with REST APIs

#### Programmatic Style

The programmatic style is more verbose but offers greater flexibility. You must use the programmatic style for:

- Trigger nodes
- Any node that isn't REST-based (including nodes that need to call a GraphQL API and nodes that use external dependencies)
- Any node that needs to transform incoming data
- Full versioning

#### Data Handling Differences

The main difference between the declarative and programmatic styles is how they handle incoming data and build API requests:

- The programmatic style requires an `execute()` method, which reads incoming data and parameters, then builds a request.
- The declarative style handles this using the `routing` key in the `operations` object.

Here's a comparison of the two styles using a simplified version of a SendGrid integration:

**Programmatic Style:**

```typescript
import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IRequestOptions,
} from 'n8n-workflow';

// Create the FriendGrid class
export class FriendGrid implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'FriendGrid',
    name: 'friendGrid',
    . . .
    properties: [
      {
        displayName: 'Resource',
        . . .
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        displayOptions: {
          show: {
              resource: [
              'contact',
              ],
          },
        },
        options: [
          {
            name: 'Create',
            value: 'create',
            description: 'Create a contact',
          },
        ],
        default: 'create',
        description: 'The operation to perform.',
      },
      {
        displayName: 'Email',
        name: 'email',
        . . .
      },
      {
        displayName: 'Additional Fields',
        // Sets up optional fields
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    let responseData;
    const resource = this.getNodeParameter('resource', 0) as string;
    const operation = this.getNodeParameter('operation', 0) as string;
    //Get credentials the user provided for this node
    const credentials = await this.getCredentials('friendGridApi') as IDataObject;

    if (resource === 'contact') {
      if (operation === 'create') {
      // Get email input
      const email = this.getNodeParameter('email', 0) as string;
      // Get additional fields input
      const additionalFields = this.getNodeParameter('additionalFields', 0) as IDataObject;
      const data: IDataObject = {
          email,
      };

      Object.assign(data, additionalFields);

      // Make HTTP request as defined in https://sendgrid.com/docs/api-reference/
      const options: IRequestOptions = {
        headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${credentials.apiKey}`,
        },
        method: 'PUT',
        body: {
            contacts: [
            data,
            ],
        },
        url: `https://api.sendgrid.com/v3/marketing/contacts`,
        json: true,
      };
      responseData = await this.helpers.httpRequest(options);
      }
    }
    // Map data to n8n data
    return [this.helpers.returnJsonArray(responseData)];
  }
}
```

**Declarative Style:**

```typescript
import { INodeType, INodeTypeDescription } from 'n8n-workflow';

// Create the FriendGrid class
export class FriendGrid implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'FriendGrid',
    name: 'friendGrid',
    . . .
    // Set up the basic request configuration
    requestDefaults: {
      baseURL: 'https://api.sendgrid.com/v3/marketing'
    },
    properties: [
      {
        displayName: 'Resource',
        . . .
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        displayOptions: {
          show: {
            resource: [
              'contact',
            ],
          },
        },
        options: [
          {
            name: 'Create',
            value: 'create',
            description: 'Create a contact',
          },
        ],
        default: 'create',
        description: 'The operation to perform.',
      },
      {
        displayName: 'Email',
        name: 'email',
        . . .
      },
      {
        displayName: 'Additional Fields',
        // Sets up optional fields
      },
    ],
    // Add the routing object
    routing: {
      request: {
        method: 'POST',
        url: '=/contacts',
        send: {
          type: 'body',
          properties: {
            email: {{$parameter["email"]}}
          }
        }
      },
      // Handle the response to contact creation
      output: {
        postReceive: [
          {
            type: 'set',
            properties: {
              value: '={{ { "success": $response } }}'
            }
          }
        ]
      }
    },
    default: 'create',
    description: 'The operation to perform.',
  },
  // No execute method needed
}
```

### Node UI Design Principles

Most nodes are a GUI (graphical user interface) representation of an API. Designing the interface means finding a user-friendly way to represent API endpoints and parameters. Directly translating an entire API into form fields in a node may not result in a good user experience.

#### Design Guidance

All nodes use N8N's node UI elements, so you don't need to consider style details such as colors, borders, and so on. However, it's still useful to go through a basic design process:

- Review the documentation for the API you're integrating. Ask yourself:
  - What can you leave out?
  - What can you simplify?
  - Which parts of the API are confusing? How can you help users understand them?
- Use a wireframe tool to try out your field layout. If you find your node has a lot of fields and is getting confusing, consider N8N's guidance on showing and hiding fields.

#### UI Text Style Standards

| Element         | Style                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Drop-down value | Title case                                                                                                                                                                                 |
| Hint            | Sentence case                                                                                                                                                                              |
| Info box        | Sentence case. Don't use a period (`.`) for one-sentence information. Always use a period if there's more than one sentence. This field can include links, which should open in a new tab. |
| Node name       | Title case                                                                                                                                                                                 |
| Parameter name  | Title case                                                                                                                                                                                 |
| Subtitle        | Title case                                                                                                                                                                                 |
| Tooltip         | Sentence case. Don't use a period (`.`) for one-sentence tooltips. Always use a period if there's more than one sentence. This field can include links, which should open in a new tab.    |

#### UI Text Terminology

- Use the same terminology as the service the node connects to. For example, a Notion node should refer to Notion blocks, not Notion paragraphs, because Notion calls these elements blocks.
- Sometimes a service has different terms for something in its API and in its GUI. Use the GUI language in your node, as this is what most users are familiar with. If you think some users may need to refer to the service's API docs, consider including this information in a hint.
- Don't use technical jargon when there are simpler alternatives.
- Be consistent when naming things. For example, choose one of `directory` or `folder` then stick to it.

#### Node Naming Conventions

| Convention                                                                                             | Correct         | Incorrect                       |
| ------------------------------------------------------------------------------------------------------ | --------------- | ------------------------------- |
| If a node is a trigger node, the displayed name should have 'Trigger' at the end, with a space before. | Shopify Trigger | ShopifyTrigger, Shopify trigger |
| Don't include 'node' in the name.                                                                      | Asana           | Asana Node, Asana node          |

#### Showing and Hiding Fields

Fields can either be:

- Displayed when the node opens: use this for resources and operations, and required fields.
- Hidden in the **Optional fields** section until a user clicks on that section: use this for optional fields.

Progressively disclose complexity: hide a field until any earlier fields it depends on have values. For example, if you have a **Filter by date** toggle, and a **Date to filter by** datepicker, don't display **Date to filter by** until the user enables **Filter by date**.

### Planning Your Node Structure

Before you start coding, plan your node's structure:

1. **Identify the API or service** you want to integrate with
2. **Determine the node type** (trigger or action)
3. **Choose the building approach** (declarative or programmatic)
4. **Map out the resources and operations** your node will support
5. **Design the user interface** following N8N's design principles
6. **Plan the file structure** for your node

## Development Phase

### Setting Up the Development Environment

To develop custom nodes for N8N, you need the following installed on your development machine:

- Node.js (version 16 or later)
- npm (usually comes with Node.js)
- Git

N8N provides a starter repository for node development. Using the starter ensures you have all necessary dependencies. It also provides a linter.

To set up your development environment:

1. Generate a new repository from the [N8N node starter template](https://github.com/n8n-io/n8n-nodes-starter)
2. Clone your new repository:

   ```bash
   git clone https://github.com/<your-organization>/<your-repo-name>.git n8n-nodes-yourproject
   cd n8n-nodes-yourproject
   ```

3. Install the project dependencies:
   ```bash
   npm install
   ```

### Creating the Node Structure

Every N8N node consists of several files organized in a specific structure. For a basic node, you need:

1. **Node folder**: A directory with your node's name
2. **Node file**: The main TypeScript file containing your node's logic
3. **Node JSON file**: A JSON file describing your node's properties
4. **Icon file**: An SVG or PNG file for your node's icon
5. **Credentials file**: A TypeScript file defining the credentials your node needs

Here's an example structure for a node called "FriendGrid":

```
nodes/
└── FriendGrid/
    ├── FriendGrid.node.ts
    ├── FriendGrid.node.json
    └── friendGrid.svg
credentials/
└── FriendGridApi.credentials.ts
```

### Implementing Programmatic-Style Nodes

This section focuses on building Action Nodes using the Programmatic style, as requested.

#### Step 1: Define the Node in the Base File

Every node must have a base file. For a programmatic-style node, this file contains the main class that implements the `INodeType` interface.

Start by adding the import statements:

```typescript
import { IExecuteFunctions } from "n8n-core";

import {
  IDataObject,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";

import { OptionsWithUri } from "request";
```

#### Step 2: Create the Main Class

The node must export an interface that implements `INodeType`. This interface must include a `description` interface, which in turn contains the `properties` array.

```typescript
export class FriendGrid implements INodeType {
  description: INodeTypeDescription = {
    // Basic node details will go here
    properties: [
      // Resources and operations will go here
    ],
  };
  // The execute method will go here
  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {}
}
```

Make sure the class name and the file name match. For example, given a class `FriendGrid`, the filename must be `FriendGrid.node.ts`.

#### Step 3: Add Node Details

All programmatic nodes need some basic parameters, such as their display name and icon. Add the following to the `description`:

```typescript
displayName: 'FriendGrid',
name: 'friendGrid',
icon: 'file:friendGrid.svg',
group: ['transform'],
version: 1,
description: 'Consume SendGrid API',
defaults: {
	name: 'FriendGrid',
},
inputs: ['main'],
outputs: ['main'],
credentials: [
	{
		name: 'friendGridApi',
		required: true,
	},
],
```

N8N uses some of the properties set in `description` to render the node in the Editor UI. These properties are `displayName`, `icon`, and `description`.

#### Step 4: Add Resources and Operations

The resource object defines the API resource that the node uses. For example, if you're creating a node to access a SendGrid API endpoint like `/v3/marketing/contacts`, you would define a resource for this endpoint:

```typescript
{
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	options: [
		{
			name: 'Contact',
			value: 'contact',
		},
	],
	default: 'contact',
	noDataExpression: true,
	required: true,
	description: 'Create a new contact',
},
```

The operations object defines what you can do with a resource. It usually relates to REST API verbs (GET, POST, etc.). For example, to create a contact:

```typescript
{
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	displayOptions: {
		show: {
			resource: [
				'contact',
			],
		},
	},
	options: [
		{
			name: 'Create',
			value: 'create',
			description: 'Create a contact',
			action: 'Create a contact',
		},
	],
	default: 'create',
	noDataExpression: true,
},
{
	displayName: 'Email',
	name: 'email',
	type: 'string',
	required: true,
	displayOptions: {
		show: {
			operation: [
				'create',
			],
			resource: [
				'contact',
			],
		},
	},
	default: '',
	description: 'Primary email for the contact',
},
```

#### Step 5: Implement the Execute Method

The `execute` method is where the actual logic of your node happens. This method is called when the node is executed in a workflow. It receives the input data from previous nodes and returns the output data to be passed to the next nodes.

Here's an example of an `execute` method for a node that creates a contact in SendGrid:

```typescript
async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
	let responseData;
	const resource = this.getNodeParameter('resource', 0) as string;
	const operation = this.getNodeParameter('operation', 0) as string;
	//Get credentials the user provided for this node
	const credentials = await this.getCredentials('friendGridApi') as IDataObject;

	if (resource === 'contact') {
		if (operation === 'create') {
			// Get email input
			const email = this.getNodeParameter('email', 0) as string;
			// Get additional fields input
			const additionalFields = this.getNodeParameter('additionalFields', 0) as IDataObject;
			const data: IDataObject = {
				email,
			};

			Object.assign(data, additionalFields);

			// Make HTTP request as defined in https://sendgrid.com/docs/api-reference/
			const options: IRequestOptions = {
				headers: {
					'Accept': 'application/json',
					'Authorization': `Bearer ${credentials.apiKey}`,
				},
				method: 'PUT',
				body: {
					contacts: [
						data,
					],
				},
				url: `https://api.sendgrid.com/v3/marketing/contacts`,
				json: true,
			};
			responseData = await this.helpers.httpRequest(options);
		}
	}
	// Map data to n8n data
	return [this.helpers.returnJsonArray(responseData)];
}
```

### Handling Credentials

Credentials in N8N are used to authenticate with external services. They are stored securely and can be reused across different nodes.

#### Step 1: Create the Credentials File

Create a file named `YourServiceApi.credentials.ts` in the `credentials` directory. This file defines the credentials your node needs to authenticate with the external service.

Here's an example for a SendGrid API credential:

```typescript
import { ICredentialType, INodeProperties } from "n8n-workflow";

export class FriendGridApi implements ICredentialType {
  name = "friendGridApi";
  displayName = "FriendGrid API";
  documentationUrl = "https://sendgrid.com/docs/api-reference/";
  properties: INodeProperties[] = [
    {
      displayName: "API Key",
      name: "apiKey",
      type: "string",
      default: "",
    },
  ];
}
```

#### Step 2: Reference the Credentials in Your Node

In your node's base file, reference the credentials in the `description` object:

```typescript
credentials: [
	{
		name: 'friendGridApi',
		required: true,
	},
],
```

#### Step 3: Use the Credentials in Your Execute Method

In your node's `execute` method, retrieve the credentials using the `getCredentials` method:

```typescript
const credentials = (await this.getCredentials("friendGridApi")) as IDataObject;
```

Then use the credentials in your API requests:

```typescript
const options: IRequestOptions = {
  headers: {
    Accept: "application/json",
    Authorization: `Bearer ${credentials.apiKey}`,
  },
  // ...
};
```

### Building the Node UI

The node UI is defined in the `properties` array of the `description` object. Each property represents a field in the node's UI.

#### Common UI Elements

Here are some common UI elements you can use in your node:

1. **Text Input**:

   ```typescript
   {
     displayName: 'Name',
     name: 'name',
     type: 'string',
     default: '',
     description: 'The name of the item',
   }
   ```

2. **Dropdown/Select**:

   ```typescript
   {
     displayName: 'Operation',
     name: 'operation',
     type: 'options',
     options: [
       {
         name: 'Create',
         value: 'create',
       },
       {
         name: 'Delete',
         value: 'delete',
       },
     ],
     default: 'create',
   }
   ```

3. **Boolean/Toggle**:

   ```typescript
   {
     displayName: 'Active',
     name: 'active',
     type: 'boolean',
     default: true,
     description: 'Whether the item is active',
   }
   ```

4. **Number Input**:

   ```typescript
   {
     displayName: 'Limit',
     name: 'limit',
     type: 'number',
     default: 50,
     description: 'Max number of results to return',
   }
   ```

5. **Date/Time Picker**:
   ```typescript
   {
     displayName: 'Start Date',
     name: 'startDate',
     type: 'dateTime',
     default: '',
     description: 'The start date',
   }
   ```

#### Conditional Fields

You can show or hide fields based on the values of other fields using the `displayOptions` property:

```typescript
{
  displayName: 'Email',
  name: 'email',
  type: 'string',
  required: true,
  displayOptions: {
    show: {
      operation: [
        'create',
      ],
      resource: [
        'contact',
      ],
    },
  },
  default: '',
  description: 'Primary email for the contact',
}
```

In this example, the "Email" field will only be shown when the "Operation" is set to "create" and the "Resource" is set to "contact".

### Error Handling

Proper error handling is essential for creating robust nodes. Here are some best practices:

1. **Use try-catch blocks** to catch and handle errors:

   ```typescript
   try {
     // Code that might throw an error
     responseData = await this.helpers.httpRequest(options);
   } catch (error) {
     // Handle the error
     if (error.response && error.response.body && error.response.body.errors) {
       // Extract error message from API response
       throw new Error(
         `SendGrid error: ${error.response.body.errors[0].message}`,
       );
     }
     // Re-throw the error with a more descriptive message
     throw new Error(`Error: ${error.message}`);
   }
   ```

2. **Validate user inputs** before making API requests:

   ```typescript
   const email = this.getNodeParameter("email", 0) as string;
   if (!email) {
     throw new Error("Email is required");
   }
   ```

3. **Provide helpful error messages** that guide users to fix the issue:
   ```typescript
   if (error.response && error.response.statusCode === 401) {
     throw new Error("Authentication failed. Please check your API key.");
   }
   ```

## Testing Phase

### Running Nodes Locally

To test your node during development, you need to link it to a local N8N installation.

#### Step 1: Install N8N Locally

If you don't have N8N installed locally, you can install it using npm:

```bash
npm install n8n -g
```

#### Step 2: Link Your Node Package

In your node package directory, run:

```bash
npm link
```

#### Step 3: Link Your Package to N8N

In your N8N installation directory, run:

```bash
npm link n8n-nodes-yourproject
```

Replace `n8n-nodes-yourproject` with the name of your package as defined in your `package.json`.

#### Step 4: Start N8N

Start N8N with the following command:

```bash
n8n start
```

Your custom node should now be available in the N8N editor.

### Using the Node Linter

N8N's node linter, `eslint-plugin-n8n-nodes-base`, statically analyzes the source code of N8N nodes and credentials. The linter detects issues and automatically fixes them to help you follow best practices.

#### Setup

If using the N8N node starter, run `npm install` in the starter project to install all dependencies. Once the installation finishes, the linter is available to you.

If using VS Code, install the [ESLint VS Code extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint). For other IDEs, refer to their ESLint integrations.

> **Note**: Don't edit the configuration file `.eslintrc.js` as it contains the configuration for `eslint-plugin-n8n-nodes-base`.

#### Usage

You can use the linter in a community package or in the main N8N repository.

In a community package, the linter runs automatically after installing dependencies and before publishing the package to npm. In the main N8N repository, the linter runs automatically using GitHub Actions whenever you push to your pull request.

In both cases, VS Code lints in the background as you work on your project. Hover over a detected issue to see a full description of the linting and a link to further information.

You can also run the linter manually:

- Run `npm run lint` to lint and view detected issues in your console.
- Run `npm run lintfix` to lint and automatically fix issues.

Both commands can run in the root directory of your community package, or in `/packages/nodes-base/` in the main repository.

#### Exceptions

Instead of fixing a rule violation, you can also make an exception for it, so the linter doesn't flag it.

To make a lint exception from VS Code: hover over the issue and click on `Quick fix` (or `cmd+.` in macOS) and select **Disable {rule} for this line**. Only disable rules for a line where you have good reason to.

To add a lint exception to a single file, add a code comment. In particular, TSLint rules may not show up in VS Code and may need to be turned off using code comments.

### Troubleshooting Common Issues

#### Credentials Issues

**Error message: 'Credentials of type "\*" aren't known'**

Check that the name in the credentials array matches the name used in the property name of the credentials' class.

#### Editor UI Issues

**Error message: 'There was a problem loading init data: API-Server can not be reached. It's probably down'**

- Check that the names of the node file, node folder, and class match the path added to `packages/nodes-base/package.json`.
- Check that the names used in the `displayOptions` property are names used by UI elements in the node.

**Node icon doesn't show up in the Add Node menu and the Editor UI**

- Check that the icon is in the same folder as the node.
- Check that it's either in PNG or SVG format.
- When the `icon` property references the icon file, check that it includes the logo extension (`.png` or `.svg`) and that it prefixes it with `file:`. For example, `file:friendGrid.png` or `file:friendGrid.svg`.
- If you use an SVG file, make sure the canvas size is square.
- If you use a PNG file, make sure that it's 60x60 pixels.

**Node doesn't show up in the Add Node menu**

Check that you registered the node in the `package.json` file in your project.

**Changes to the description properties don't show in the UI on refreshing**

Every time you change the description properties, you have to stop the current N8N process (`ctrl` + `c`) and run it again. You may also need to re-run `npm link`.

**Linter incorrectly warning about file name case**

The node linter has rules for file names, including what case they should be. Windows users may encounter an issue when renaming files that causes the linter to continue giving warnings, even after you rename the files. This is due to a known Windows issue with changing case when renaming files.

### Debugging Techniques

#### Console Logging

You can use `console.log` statements in your node's code to debug issues:

```typescript
console.log("Resource:", resource);
console.log("Operation:", operation);
console.log("Data:", data);
```

The logs will appear in the terminal where you started N8N.

#### Using the N8N Debugger

N8N has a built-in debugger that allows you to see the input and output of each node in a workflow. To use it:

1. Add your node to a workflow
2. Configure it with test data
3. Click the "Execute Workflow" button
4. Check the "Executions" tab to see the results

#### Inspecting Network Requests

If your node makes HTTP requests to an external API, you can inspect these requests to debug issues:

1. Add `console.log` statements before and after the HTTP request:

   ```typescript
   console.log("Request options:", options);
   try {
     responseData = await this.helpers.httpRequest(options);
     console.log("Response:", responseData);
   } catch (error) {
     console.error("Error:", error.message);
     if (error.response) {
       console.error("Response status:", error.response.statusCode);
       console.error("Response body:", error.response.body);
     }
     throw error;
   }
   ```

2. Check the logs in the terminal where you started N8N.

## Deployment Phase

### Packaging Your Node

Once your node is ready for deployment, you need to package it for distribution.

#### Step 1: Update Package.json

Make sure your `package.json` file has the correct information:

```json
{
  "name": "n8n-nodes-yourproject",
  "version": "0.1.0",
  "description": "Your node description",
  "keywords": ["n8n-community-node-package"],
  "license": "MIT",
  "homepage": "https://n8n.io",
  "author": {
    "name": "Your Name",
    "email": "your.email@example.com"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/n8n-nodes-yourproject.git"
  },
  "main": "index.js",
  "scripts": {
    "build": "tsc && gulp build:icons",
    "dev": "tsc --watch",
    "format": "prettier nodes credentials --write",
    "lint": "eslint nodes credentials package.json",
    "lintfix": "eslint nodes credentials package.json --fix",
    "prepublishOnly": "npm run build && npm run lint -c .eslintrc.prepublish.js nodes credentials package.json"
  },
  "files": ["dist"],
  "n8n": {
    "n8nNodesApiVersion": 1,
    "credentials": ["dist/credentials/YourServiceApi.credentials.js"],
    "nodes": ["dist/nodes/YourService/YourService.node.js"]
  },
  "devDependencies": {
    "@types/express": "^4.17.6",
    "@types/request-promise-native": "~1.0.15",
    "@typescript-eslint/parser": "~5.45",
    "eslint-plugin-n8n-nodes-base": "^1.0.0",
    "gulp": "^4.0.2",
    "n8n-core": "^0.125.0",
    "n8n-workflow": "^0.107.0",
    "prettier": "^2.7.1",
    "typescript": "~4.8.4"
  }
}
```

Make sure to update the following fields:

- `name`: The name of your package
- `version`: The version of your package
- `description`: A short description of your node
- `author`: Your name and email
- `repository`: The URL of your git repository
- `n8n.credentials`: The paths to your credential files
- `n8n.nodes`: The paths to your node files

#### Step 2: Build Your Package

Run the build command to compile your TypeScript code:

```bash
npm run build
```

This will create a `dist` directory with the compiled JavaScript files.

#### Step 3: Test Your Package

Before publishing, test your package to make sure it works correctly:

```bash
npm link
```

Then, in your N8N installation directory:

```bash
npm link n8n-nodes-yourproject
```

Start N8N and test your node.

### Publishing Your Node

Once your node is tested and ready, you can publish it to npm.

#### Step 1: Login to npm

If you haven't already, create an account on [npmjs.com](https://www.npmjs.com/) and login using the npm CLI:

```bash
npm login
```

#### Step 2: Publish Your Package

Run the publish command:

```bash
npm publish
```

If your package name starts with `n8n-nodes-`, it will be automatically listed in the N8N community nodes list.

### Sharing with the Community

After publishing your node, you can share it with the N8N community:

1. **Announce it on the N8N forum**: Create a post on the [N8N forum](https://community.n8n.io/) to announce your node.
2. **Share it on social media**: Share your node on Twitter, LinkedIn, or other social media platforms.
3. **Create a GitHub repository**: If you haven't already, create a GitHub repository for your node and add documentation.

### Maintaining Your Node

Once your node is published, you'll need to maintain it:

1. **Respond to issues**: Monitor the GitHub repository for issues and respond to them.
2. **Update for API changes**: If the API you're integrating with changes, update your node accordingly.
3. **Update for N8N changes**: When N8N releases new versions, test your node and update it if necessary.
4. **Release new versions**: When you make changes, release new versions of your node.

## Code Examples

### Complete Programmatic-Style Node Example

Here's a complete example of a programmatic-style node that integrates with the SendGrid API:

```typescript
import { IExecuteFunctions } from "n8n-core";

import {
  IDataObject,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";

export class FriendGrid implements INodeType {
  description: INodeTypeDescription = {
    displayName: "FriendGrid",
    name: "friendGrid",
    icon: "file:friendGrid.svg",
    group: ["transform"],
    version: 1,
    description: "Consume SendGrid API",
    defaults: {
      name: "FriendGrid",
    },
    inputs: ["main"],
    outputs: ["main"],
    credentials: [
      {
        name: "friendGridApi",
        required: true,
      },
    ],
    properties: [
      {
        displayName: "Resource",
        name: "resource",
        type: "options",
        options: [
          {
            name: "Contact",
            value: "contact",
          },
        ],
        default: "contact",
        noDataExpression: true,
        required: true,
        description: "Create a new contact",
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        displayOptions: {
          show: {
            resource: ["contact"],
          },
        },
        options: [
          {
            name: "Create",
            value: "create",
            description: "Create a contact",
            action: "Create a contact",
          },
        ],
        default: "create",
        noDataExpression: true,
      },
      {
        displayName: "Email",
        name: "email",
        type: "string",
        required: true,
        displayOptions: {
          show: {
            operation: ["create"],
            resource: ["contact"],
          },
        },
        default: "",
        description: "Primary email for the contact",
      },
      {
        displayName: "Additional Fields",
        name: "additionalFields",
        type: "collection",
        placeholder: "Add Field",
        default: {},
        displayOptions: {
          show: {
            operation: ["create"],
            resource: ["contact"],
          },
        },
        options: [
          {
            displayName: "First Name",
            name: "first_name",
            type: "string",
            default: "",
            description: "The contact's first name",
          },
          {
            displayName: "Last Name",
            name: "last_name",
            type: "string",
            default: "",
            description: "The contact's last name",
          },
        ],
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    let responseData;
    const resource = this.getNodeParameter("resource", 0) as string;
    const operation = this.getNodeParameter("operation", 0) as string;
    //Get credentials the user provided for this node
    const credentials = (await this.getCredentials(
      "friendGridApi",
    )) as IDataObject;

    if (resource === "contact") {
      if (operation === "create") {
        // Get email input
        const email = this.getNodeParameter("email", 0) as string;
        // Get additional fields input
        const additionalFields = this.getNodeParameter(
          "additionalFields",
          0,
        ) as IDataObject;
        const data: IDataObject = {
          email,
        };

        Object.assign(data, additionalFields);

        // Make HTTP request as defined in https://sendgrid.com/docs/api-reference/
        const options = {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${credentials.apiKey}`,
          },
          method: "PUT",
          body: {
            contacts: [data],
          },
          url: `https://api.sendgrid.com/v3/marketing/contacts`,
          json: true,
        };

        try {
          responseData = await this.helpers.request(options);
        } catch (error) {
          if (
            error.response &&
            error.response.body &&
            error.response.body.errors
          ) {
            throw new Error(
              `SendGrid error: ${error.response.body.errors[0].message}`,
            );
          }
          throw error;
        }
      }
    }
    // Map data to n8n data
    return [this.helpers.returnJsonArray(responseData)];
  }
}
```

### Credentials Implementation

Here's an example of a credentials file for the SendGrid API:

```typescript
import { ICredentialType, INodeProperties } from "n8n-workflow";

export class FriendGridApi implements ICredentialType {
  name = "friendGridApi";
  displayName = "FriendGrid API";
  documentationUrl = "https://sendgrid.com/docs/api-reference/";
  properties: INodeProperties[] = [
    {
      displayName: "API Key",
      name: "apiKey",
      type: "string",
      default: "",
    },
  ];
}
```

### UI Elements Implementation

Here are examples of different UI elements you can use in your node:

```typescript
// Text input
{
	displayName: 'Name',
	name: 'name',
	type: 'string',
	default: '',
	description: 'The name of the item',
},

// Dropdown/Select
{
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	options: [
		{
			name: 'Create',
			value: 'create',
		},
		{
			name: 'Delete',
			value: 'delete',
		},
	],
	default: 'create',
},

// Boolean/Toggle
{
	displayName: 'Active',
	name: 'active',
	type: 'boolean',
	default: true,
	description: 'Whether the item is active',
},

// Number input
{
	displayName: 'Limit',
	name: 'limit',
	type: 'number',
	default: 50,
	description: 'Max number of results to return',
},

// Date/Time picker
{
	displayName: 'Start Date',
	name: 'startDate',
	type: 'dateTime',
	default: '',
	description: 'The start date',
},

// Collection (group of fields)
{
	displayName: 'Additional Fields',
	name: 'additionalFields',
	type: 'collection',
	placeholder: 'Add Field',
	default: {},
	options: [
		{
			displayName: 'First Name',
			name: 'first_name',
			type: 'string',
			default: '',
			description: 'The contact\'s first name',
		},
		{
			displayName: 'Last Name',
			name: 'last_name',
			type: 'string',
			default: '',
			description: 'The contact\'s last name',
		},
	],
},

// Conditional fields
{
	displayName: 'Email',
	name: 'email',
	type: 'string',
	required: true,
	displayOptions: {
		show: {
			operation: [
				'create',
			],
			resource: [
				'contact',
			],
		},
	},
	default: '',
	description: 'Primary email for the contact',
},
```

### API Integration Examples

Here are examples of different API integrations:

#### GET Request

```typescript
// Get a list of contacts
if (operation === "getAll") {
  const returnAll = this.getNodeParameter("returnAll", 0) as boolean;
  const limit = this.getNodeParameter("limit", 0) as number;

  const options = {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${credentials.apiKey}`,
    },
    method: "GET",
    url: `https://api.sendgrid.com/v3/marketing/contacts`,
    json: true,
    qs: {},
  };

  if (!returnAll) {
    options.qs.limit = limit;
  }

  responseData = await this.helpers.request(options);

  if (returnAll === false) {
    responseData = responseData.result.slice(0, limit);
  } else {
    responseData = responseData.result;
  }
}
```

#### POST Request

```typescript
// Create a new list
if (operation === "create") {
  const name = this.getNodeParameter("name", 0) as string;

  const options = {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${credentials.apiKey}`,
    },
    method: "POST",
    body: {
      name,
    },
    url: `https://api.sendgrid.com/v3/marketing/lists`,
    json: true,
  };

  responseData = await this.helpers.request(options);
}
```

#### PUT Request

```typescript
// Update a contact
if (operation === "update") {
  const contactId = this.getNodeParameter("contactId", 0) as string;
  const updateFields = this.getNodeParameter("updateFields", 0) as IDataObject;

  const options = {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${credentials.apiKey}`,
    },
    method: "PUT",
    body: {
      contacts: [
        {
          id: contactId,
          ...updateFields,
        },
      ],
    },
    url: `https://api.sendgrid.com/v3/marketing/contacts`,
    json: true,
  };

  responseData = await this.helpers.request(options);
}
```

#### DELETE Request

```typescript
// Delete a contact
if (operation === "delete") {
  const contactIds = this.getNodeParameter("contactIds", 0) as string;

  const options = {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${credentials.apiKey}`,
    },
    method: "DELETE",
    url: `https://api.sendgrid.com/v3/marketing/contacts?ids=${contactIds}`,
    json: true,
  };

  responseData = await this.helpers.request(options);
}
```

## Reference Materials

For more information, refer to the following resources:

- [N8N Documentation](https://docs.n8n.io/)
- [N8N GitHub Repository](https://github.com/n8n-io/n8n)
- [N8N Community Forum](https://community.n8n.io/)
- [N8N Node Starter Repository](https://github.com/n8n-io/n8n-nodes-starter)
