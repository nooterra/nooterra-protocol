FROM node:20-slim

# Work in /app and copy only what we need from the build context
WORKDIR /app

# Bring shared packages + root tsconfig for local file: deps
COPY packages ./packages
COPY tsconfig.json ./tsconfig.json

# Build shared packages (dist is git-ignored). Allow missing peer deps to keep ci happy in container.
ENV npm_config_legacy_peer_deps=true
WORKDIR /app/packages/nooterra-core
RUN npm ci && npm run build
WORKDIR /app/packages/nooterra-agent-sdk
RUN npm ci && npm run build

# Install only echo agent deps with the current build-context code
WORKDIR /app/examples/agent-echo
COPY examples/agent-echo/package*.json ./
RUN npm ci
COPY examples/agent-echo ./

CMD ["npm", "run", "start"]
