FROM node:20-slim

# Bring the whole repo so file: deps (agent-sdk, core) resolve
WORKDIR /app
COPY . .

# Build shared packages (dist is git-ignored). We allow missing peer deps in this container.
ENV npm_config_legacy_peer_deps=true
RUN npm --prefix /app/packages/nooterra-core ci && npm --prefix /app/packages/nooterra-core run build && \
    npm --prefix /app/packages/nooterra-agent-sdk ci && npm --prefix /app/packages/nooterra-agent-sdk run build

# Install only the logistics agents' dependencies
WORKDIR /app/examples/logistics-agents
RUN npm ci

# Use AGENT_START_CMD to select which agent to run (start:weather/start:customs/start:rail)
CMD ["sh", "-c", "npm run ${AGENT_START_CMD:-start:weather}"]
