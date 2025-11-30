FROM node:20-slim

# Work in /app so file: deps resolve from the monorepo layout
WORKDIR /app

# Copy shared packages + tsconfig for local file: resolutions
COPY packages ./packages
COPY tsconfig.json ./tsconfig.json

# Build shared packages (dist is git-ignored). Allow missing peer deps to keep ci happy in container.
ENV npm_config_legacy_peer_deps=true
WORKDIR /app/packages/nooterra-core
RUN npm ci && npm run build
WORKDIR /app/packages/nooterra-agent-sdk
RUN npm ci && npm run build

# Install only the starter agent deps and source
WORKDIR /app/examples/agent-starter
COPY examples/agent-starter/package*.json ./
RUN npm ci
COPY examples/agent-starter ./

# Expose PORT if Railway/any PaaS wants to map it
ENV PORT=3000

# Default start; override env vars as needed (DID, ENDPOINT, COORD_URL, REGISTRY_URL, WEBHOOK_SECRET)
CMD ["npm", "run", "start"]
