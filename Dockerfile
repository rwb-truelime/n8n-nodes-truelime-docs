FROM docker.n8n.io/n8nio/n8n:latest

USER root
WORKDIR /usr/local/lib/node_modules/n8n

# Install system dependencies
RUN apk update && apk add --no-cache ghostscript libreoffice ffmpeg poppler-utils

# Copy the desired npm module(s) to the container
COPY zerox-truelime-1.1.15.tgz .

# Install the desired npm module(s)
RUN npm install ./zerox-truelime-1.1.15.tgz --loglevel verbose
RUN npm install langfuse --loglevel verbose

# Ensure the target directories exist and copy the contents into them
COPY node-zerox-n8n/dist/credentials /home/node/.n8n/custom/credentials/
COPY node-zerox-n8n/dist/nodes /home/node/.n8n/custom/nodes/
COPY node-zerox-n8n/nodes/Zerox/truelime-zwart.png /home/node/.n8n/custom/nodes/truelime-zwart.png
COPY node-zerox-n8n/nodes/Zerox/truelime.png /home/node/.n8n/custom/nodes/truelime.png
COPY node-zerox-n8n/nodes/Zerox/truelime.svg /home/node/.n8n/custom/nodes/truelime.svg

RUN chown -R node:node /home/node/.n8n/custom/credentials && chown -R node:node /home/node/.n8n/custom/nodes
# Change the ownership of the installed module(s) to the node user is not needed, ALL N8N packages are installed as root
# RUN chown -R node:node /usr/local/lib/node_modules/n8n/node_modules/zerox-truelime && chown -R node:node /usr/local/lib/node_modules/n8n/node_modules/langfuse

# Switch back to the node homedir and user
WORKDIR /home/node
USER node
COPY ai-ktl.jpg .
