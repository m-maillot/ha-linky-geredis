FROM alpine:latest

LABEL org.opencontainers.image.source=https://github.com/m-maillot/ha-linky-geredis
LABEL org.opencontainers.image.description="HA Linky Geredis Standalone"
LABEL org.opencontainers.image.licenses=MIT

RUN apk add --no-cache nodejs npm

WORKDIR /linky

# Install dependencies
COPY package.json .
COPY package-lock.json .
RUN npm ci --ignore-scripts

# Copy add-on code
COPY . .

# Transpile TypeScript
RUN npm run build

CMD [ "node", "--experimental-modules", "dist/index.js" ]

