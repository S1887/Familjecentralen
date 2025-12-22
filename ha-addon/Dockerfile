FROM node:18-alpine

# Installera git och bash
RUN apk add --no-cache git bash

# Skapa app-mapp och data-mapp
WORKDIR /app
RUN mkdir -p /data

# Klona koden från GitHub
ARG CACHEBUST=40
RUN git clone https://github.com/S1887/Familjecentralen.git .

# Installera beroenden
RUN npm install

# Bygg frontend
RUN npm run build

# Exponera port
EXPOSE 3001

# Starta servern
ENV DATA_DIR=/data
# Use root to ensure we can fix permissions on startup, or just run as node if permissions are set correctly on host
# For HA Add-ons, running as root is often simpler to handle volume permissions
CMD ["node", "server/index.js"]
