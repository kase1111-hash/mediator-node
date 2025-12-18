FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production

# Copy server
COPY server.js ./

# Expose API port
EXPOSE 8545

# Start the mock server
CMD ["node", "server.js"]
