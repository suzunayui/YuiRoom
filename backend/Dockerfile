FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .

EXPOSE 3000

RUN apk add --no-cache wget ffmpeg

CMD ["npm", "run", "start", "--silent"]
