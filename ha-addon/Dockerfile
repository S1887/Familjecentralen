ARG BUILD_FROM
FROM $BUILD_FROM

# Installera Node.js, npm och git
RUN apk add --no-cache nodejs npm git

# Skapa app-mapp
WORKDIR /app

# Klona koden från GitHub
ARG CACHEBUST=36
RUN git clone https://github.com/S1887/Familjecentralen.git .

# Installera beroenden
RUN npm install

# Bygg frontend
RUN npm run build

# Exponera port
EXPOSE 3001

# Skapa S6 service directory (rätt sätt för HA Add-ons)
RUN mkdir -p /etc/services.d/familjecentralen

# Kopiera startscript till S6 service directory
COPY run.sh /etc/services.d/familjecentralen/run
RUN chmod a+x /etc/services.d/familjecentralen/run && \
    sed -i 's/\r$//' /etc/services.d/familjecentralen/run

