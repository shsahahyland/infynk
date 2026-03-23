FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production

COPY index.js adaptiveCard.json ./

EXPOSE 3978

CMD ["node", "index.js"]
