FROM node:20-slim
WORKDIR /app

# When build context is repo root, pull the agent-specific manifest
COPY examples/logistics-agents/package.json examples/logistics-agents/package-lock.json ./
RUN npm ci

# Copy agent source
COPY examples/logistics-agents/. .

# Use AGENT_START_CMD to select which agent to run (start:weather/start:customs/start:rail)
CMD ["sh", "-c", "npm run ${AGENT_START_CMD:-start:weather}"]
