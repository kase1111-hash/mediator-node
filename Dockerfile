FROM node:18-alpine

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# Create data directory
RUN mkdir -p /app/data/vector-db /app/logs

# Expose health check port (if we add one later)
EXPOSE 9090

# Run the mediator node
CMD ["node", "dist/cli.js", "start"]
