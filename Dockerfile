ARG N8N_VERSION=1.123.5
FROM docker.n8n.io/n8nio/n8n:${N8N_VERSION}

ARG LIMESCAPE_DOCS_VERSION=1.23.0

USER root
WORKDIR /usr/local/lib/node_modules/n8n

# Install system dependencies
RUN apk update && apk add --no-cache ghostscript libreoffice ffmpeg poppler-utils

# Install the desired npm module(s)
RUN npm i -g langfuse-langchain --loglevel verbose

# Install the custom nodes
RUN mkdir /home/node/.n8n/nodes
COPY n8n-nodes-limescape-docs-${LIMESCAPE_DOCS_VERSION}.tgz /home/node/.n8n/nodes/n8n-nodes-limescape-docs-${LIMESCAPE_DOCS_VERSION}.tgz
COPY limescape-docs-${LIMESCAPE_DOCS_VERSION}.tgz /home/node/.n8n/nodes/limescape-docs-${LIMESCAPE_DOCS_VERSION}.tgz
RUN cd /home/node/.n8n/nodes/ && npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz --loglevel verbose && npm install ./limescape-docs-${LIMESCAPE_DOCS_VERSION}.tgz --loglevel verbose && npm install ./n8n-nodes-limescape-docs-${LIMESCAPE_DOCS_VERSION}.tgz --loglevel verbose && npm install @langfuse/n8n-nodes-langfuse --loglevel verbose n8n-nodes-eml --loglevel verbose n8n-nodes-run-node-with-credentials-x --loglevel verbose && chown -R node:node /home/node/.n8n/nodes && rm -rf /home/node/.n8n/nodes/*.tgz

# Switch back to the node homedir and user
WORKDIR /home/node
USER node
COPY ai-ktl.jpg .
