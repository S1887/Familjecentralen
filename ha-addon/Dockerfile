ARG BUILD_FROM
FROM $BUILD_FROM

# Installera Node.js, npm och git
RUN apk add --no-cache nodejs npm git

# Skapa app-mapp
WORKDIR /app

# Klona koden från GitHub
# Klona koden från GitHub (Uppdaterad 1.0.2)
ARG CACHEBUST=2
RUN git clone https://github.com/S1887/Familjecentralen.git .

# Installera beroenden
RUN npm install

# Bygg frontend
RUN npm run build

# Exponera port
EXPOSE 3001

# Starta servern
CMD [ "npm", "run", "server" ]
