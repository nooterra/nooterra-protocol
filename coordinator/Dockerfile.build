FROM node:20-slim

WORKDIR /app

# Use repo root as context; pull coordinator-specific files
COPY coordinator/package.json coordinator/package-lock.json coordinator/tsconfig.json ./
RUN npm ci

# Copy coordinator source
COPY coordinator/src ./src

RUN npm run build

CMD ["node", "dist/server.js"]
