FROM node:20-slim
WORKDIR /app

# shared packages (included in build context)
COPY packages ./packages
COPY tsconfig.json ./tsconfig.json

ENV npm_config_legacy_peer_deps=true
WORKDIR /app/packages/nooterra-core
RUN npm ci && npm run build
WORKDIR /app/packages/nooterra-agent-sdk
RUN npm ci && npm run build

# agent (files are in context root after copy)
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

CMD ["npm", "run", "start"]
