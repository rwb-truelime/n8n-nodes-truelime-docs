FROM docker.n8n.io/n8nio/n8n:latest

USER root
WORKDIR /usr/local/lib/node_modules/n8n

# Install system dependencies
RUN apk update && apk add --no-cache ghostscript libreoffice ffmpeg poppler-utils

# Install the desired npm module(s)
RUN npm install langfuse --loglevel verbose

# Install the custom nodes
RUN mkdir /home/node/.n8n/nodes
COPY n8n-nodes-truelime-docs-1.0.0.tgz /home/node/.n8n/nodes/n8n-nodes-truelime-docs-1.0.0.tgz
COPY truelime-docs-processor-1.1.17.tgz /home/node/.n8n/nodes/truelime-docs-processor-1.1.17.tgz
RUN cd /home/node/.n8n/nodes/ && npm install ./n8n-nodes-truelime-docs-1.0.0.tgz --loglevel verbose && chown -R node:node /home/node/.n8n/nodes && rm -rf /home/node/.n8n/nodes/*.tgz

# Switch back to the node homedir and user
WORKDIR /home/node
USER node
COPY ai-ktl.jpg .
