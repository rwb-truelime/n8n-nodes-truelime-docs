FROM docker.n8n.io/n8nio/n8n:latest

USER root
WORKDIR /usr/local/lib/node_modules/n8n

# Install system dependencies
RUN apk update && apk add --no-cache ghostscript libreoffice ffmpeg poppler-utils

# Install the desired npm module(s)
# RUN npm install langfuse --loglevel verbose

# Install the custom nodes
RUN mkdir /home/node/.n8n/nodes
COPY n8n-nodes-limescape-docs-1.1.20.tgz /home/node/.n8n/nodes/n8n-nodes-limescape-docs-1.1.20.tgz
COPY limescape-docs-processor-1.1.20.tgz /home/node/.n8n/nodes/limescape-docs-processor-1.1.20.tgz
RUN cd /home/node/.n8n/nodes/ && npm install ./n8n-nodes-limescape-docs-1.1.20.tgz --loglevel verbose && npm install n8n-nodes-eml --loglevel verbose n8n-nodes-run-node-with-credentials-x --loglevel verbose && chown -R node:node /home/node/.n8n/nodes && rm -rf /home/node/.n8n/nodes/*.tgz

# Switch back to the node homedir and user
WORKDIR /home/node
USER node
COPY ai-ktl.jpg .

