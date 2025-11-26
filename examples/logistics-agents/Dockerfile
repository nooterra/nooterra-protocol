FROM node:20-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Use AGENT_START_CMD to select which agent to run (start:weather/start:customs/start:rail)
CMD ["sh", "-c", "npm run ${AGENT_START_CMD:-start:weather}"]
