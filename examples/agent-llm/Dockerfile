FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install

COPY server.js ./

ENV PORT=4010
EXPOSE 4010

CMD ["node", "server.js"]

