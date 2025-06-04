FROM node:20-alpine

RUN apk add --no-cache git

WORKDIR /bloombot

COPY package*.json ./

RUN npm install

COPY . .

CMD ["npm", "start"]