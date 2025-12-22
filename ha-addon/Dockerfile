FROM node:18-alpine

# Installera git och bash
RUN apk add --no-cache git bash

# Skapa app-mapp
WORKDIR /app

# Klona koden från GitHub
ARG CACHEBUST=38
RUN git clone https://github.com/S1887/Familjecentralen.git .

# Installera beroenden
RUN npm install

# Bygg frontend
RUN npm run build

# Skapa data-mapp
RUN mkdir -p /data && chown -R node:node /data

# Exponera port
EXPOSE 3001

# Kör som node-användare
USER node

# Starta servern
ENV DATA_DIR=/data
CMD ["node", "server/index.js"]
