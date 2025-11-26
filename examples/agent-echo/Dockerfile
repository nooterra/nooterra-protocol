FROM node:20-slim

# Bring full repo so local file: deps resolve
WORKDIR /app
COPY . .

# Build shared packages (dist is git-ignored)
RUN npm --prefix /app/packages/nooterra-core ci && npm --prefix /app/packages/nooterra-core run build && \
    npm --prefix /app/packages/nooterra-agent-sdk ci && npm --prefix /app/packages/nooterra-agent-sdk run build

# Install only echo agent deps
WORKDIR /app/examples/agent-echo
RUN npm ci

CMD ["npm", "run", "start"]
