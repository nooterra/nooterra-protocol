FROM node:20-slim

WORKDIR /app

# Install dependencies first (layer cache friendly)
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

# Copy source
COPY src ./src

# Build
RUN npm run build

# Default command can be overridden per service (dispatcher uses a different start)
CMD ["node", "dist/server.js"]
