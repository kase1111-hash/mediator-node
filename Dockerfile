# ---- Build Stage ----
FROM node:18-alpine AS builder

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# ---- Runtime Stage ----
FROM node:18-alpine

WORKDIR /app

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy only runtime artifacts from builder
COPY --from=builder /app/dist/ ./dist/
COPY --from=builder /app/node_modules/ ./node_modules/
COPY --from=builder /app/package.json ./

# Create data directories with correct ownership
RUN mkdir -p /app/data/vector-db /app/logs && \
    chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose health check port
EXPOSE 9090

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:9090/health/live || exit 1

# Run the mediator node
CMD ["node", "dist/cli.js", "start"]
