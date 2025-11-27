FROM node:20-slim

WORKDIR /app

# Install deps
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

# Copy source
COPY src ./src

# Build
RUN npm run build

# Start
CMD ["node", "dist/server.js"]
