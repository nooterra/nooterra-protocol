FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY server.mjs ./server.mjs

CMD ["node", "server.mjs"]

