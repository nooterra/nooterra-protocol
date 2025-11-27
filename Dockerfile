FROM node:20-slim

WORKDIR /app

# Copy coordinator package files
COPY coordinator/package.json coordinator/package-lock.json coordinator/tsconfig.json ./coordinator/

# Install coordinator deps
WORKDIR /app/coordinator
RUN npm ci

# Copy coordinator source
COPY coordinator/src ./src

# Build coordinator
RUN npm run build

# Start coordinator
CMD ["node", "dist/server.js"]

