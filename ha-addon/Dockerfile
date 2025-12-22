ARG BUILD_FROM
FROM $BUILD_FROM

# Installera Node.js, npm och git
RUN apk add --no-cache nodejs npm git

# Skapa app-mapp
WORKDIR /app

# Klona koden från GitHub (Uppdaterad 2.2.0 - FORCE NEW CLONE)
ARG CACHEBUST=35
RUN git clone https://github.com/S1887/Familjecentralen.git .

# Installera beroenden
RUN npm install

# Bygg frontend
RUN npm run build

# Exponera port
EXPOSE 3001

# Kopiera startscript
COPY run.sh /
RUN chmod a+x /run.sh

# Starta med scriptet
CMD [ "/run.sh" ]
