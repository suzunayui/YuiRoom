FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .

EXPOSE 3000

CMD ["npm", "run", "start", "--silent"]

