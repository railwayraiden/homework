FROM oven/bun

WORKDIR /usr/src/app

COPY package*.json ./
RUN bun i
COPY . .

EXPOSE $PORT
CMD [ "bun", "index.js" ]