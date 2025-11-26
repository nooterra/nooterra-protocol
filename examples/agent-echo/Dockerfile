FROM node:20-slim
WORKDIR /app

# Build context is repo root; pull echo manifest from subdir
COPY examples/agent-echo/package.json examples/agent-echo/package-lock.json ./
RUN npm ci

# Copy echo source
COPY examples/agent-echo/. .

CMD ["npm", "run", "start"]
