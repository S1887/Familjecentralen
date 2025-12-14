ARG BUILD_FROM
FROM $BUILD_FROM

# Installera Node.js
RUN apk add --no-cache nodejs npm git

WORKDIR /app

# Klona koden från GitHub (experimental branch)
ARG CACHEBUST=1
RUN git clone -b experimental https://github.com/S1887/Familjecentralen.git .

# Installera beroenden
RUN npm install

# Bygg frontend
RUN npm run build

# Exponera port 3002
EXPOSE 3002

# Starta servern med port override
ENV PORT=3002
CMD ["npm", "run", "server"]
