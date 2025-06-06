FROM node:20-alpine

RUN apk add --no-cache git

WORKDIR /bloom

COPY package*.json ./

RUN npm install && npm install -g pm2

COPY . .

CMD ["pm2-runtime", "start", "bloom.js"]