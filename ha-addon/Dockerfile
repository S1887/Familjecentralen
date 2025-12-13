ARG BUILD_FROM
FROM $BUILD_FROM

# Installera Node.js, npm och git
RUN apk add --no-cache nodejs npm git

# Skapa app-mapp
WORKDIR /app

# Klona koden från GitHub
RUN git clone https://github.com/S1887/Familjecentralen.git .

# Installera beroenden
RUN npm install

# Bygg frontend
RUN npm run build

# Exponera port
EXPOSE 3001

# Starta servern
CMD [ "npm", "run", "server" ]
