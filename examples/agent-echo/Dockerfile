FROM node:20-slim

# Clone full repo to fetch shared packages (agent-sdk/core) even if build context is just the agent folder
WORKDIR /tmp
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
RUN git clone https://github.com/nooterra/nooterra-protocol.git repo

# Move agent source (from build context) into /app
WORKDIR /app
COPY . .

# Copy shared packages from cloned repo so file: deps resolve
RUN mkdir -p /app/packages && cp -r /tmp/repo/packages /app/

# Build shared packages (dist is git-ignored). Allow missing peer deps to keep ci happy in container.
ENV npm_config_legacy_peer_deps=true
RUN npm --prefix /app/packages/nooterra-core ci && npm --prefix /app/packages/nooterra-core run build && \
    npm --prefix /app/packages/nooterra-agent-sdk ci && npm --prefix /app/packages/nooterra-agent-sdk run build

# Install only echo agent deps
WORKDIR /app/examples/agent-echo
RUN npm ci

CMD ["npm", "run", "start"]
