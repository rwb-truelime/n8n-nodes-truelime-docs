FROM docker.n8n.io/n8nio/n8n:latest

USER root
WORKDIR /usr/local/lib/node_modules/n8n

# Install system dependencies
RUN apk update && apk add --no-cache ghostscript libreoffice ffmpeg poppler-utils

# Copy the desired npm module(s) to the container
COPY truelime-docs-processor-1.1.17.tgz .

# Install the desired npm module(s)
RUN npm install ./truelime-docs-processor-1.1.17.tgz --loglevel verbose
RUN npm install langfuse --loglevel verbose

# Ensure the target directories exist and copy the contents into them
COPY dist/credentials /home/node/.n8n/custom/credentials/
COPY dist/nodes /home/node/.n8n/custom/nodes/
COPY nodes/TruelimeDocs/truelime-zwart.png /home/node/.n8n/custom/nodes/truelime-zwart.png
COPY nodes/TruelimeDocs/truelime.png /home/node/.n8n/custom/nodes/truelime.png
COPY nodes/TruelimeDocs/truelime.svg /home/node/.n8n/custom/nodes/truelime.svg

RUN chown -R node:node /home/node/.n8n/custom
# Change the ownership of the installed module(s) to the node user is not needed, ALL N8N packages are installed as root
# RUN chown -R node:node /usr/local/lib/node_modules/n8n/node_modules/truelime-docs-processor && chown -R node:node /usr/local/lib/node_modules/n8n/node_modules/langfuse

# Switch back to the node homedir and user
WORKDIR /home/node
USER node
COPY ai-ktl.jpg .
