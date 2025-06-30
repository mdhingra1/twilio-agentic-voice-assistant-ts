# Use Node.js 20 Alpine for smaller image size
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install system dependencies needed for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    curl \
    && ln -sf python3 /usr/bin/python

# Copy package files first for better caching
COPY package*.json ./

# Install all dependencies including dev dependencies (for tsx)
RUN npm ci --no-audit --no-fund

# Copy TypeScript configuration
COPY tsconfig.json ./

# Copy source code
COPY agent/ ./agent/
COPY app.ts ./
COPY completion-server/ ./completion-server/
COPY integration-server/ ./integration-server/
COPY lib/ ./lib/
COPY modules/ ./modules/
COPY services/ ./services/
COPY shared/ ./shared/

# No build step needed - we'll use tsx directly

# Create logs directory
RUN mkdir -p logs

# Expose the port the app runs on
EXPOSE 3333

# Health check - using a simple HTTP GET to root since no /health endpoint exists
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3333/ || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3333

# Environment variables will be provided at runtime via:
# - Docker run with --env-file .env
# - Docker compose with env_file: .env
# - Deployment platform environment configuration

# Run the application using tsx
CMD ["npm", "run", "start:tsx"]