FROM node:20-slim

# Clone full repo to fetch shared packages (agent-sdk/core) even if build context is just the agent folder
WORKDIR /tmp
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
RUN git clone https://github.com/nooterra/nooterra-protocol.git repo

# Move agent source (from build context) into /app
WORKDIR /app
# Prefer the cloned repo content to guarantee lockfiles and dist availability
RUN mkdir -p /app/examples && cp -r /tmp/repo/examples/agent-echo /app/examples/agent-echo && \
    mkdir -p /app/packages && cp -r /tmp/repo/packages /app/ && \
    cp /tmp/repo/tsconfig.json /app/tsconfig.json

# Build shared packages (dist is git-ignored). Allow missing peer deps to keep ci happy in container.
ENV npm_config_legacy_peer_deps=true
WORKDIR /app/packages/nooterra-core
RUN npm ci && npm run build
WORKDIR /app/packages/nooterra-agent-sdk
RUN npm ci && npm run build

# Install only echo agent deps
WORKDIR /app/examples/agent-echo
RUN npm ci

CMD ["npm", "run", "start"]
