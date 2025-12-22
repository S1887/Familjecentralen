ARG BUILD_FROM
FROM $BUILD_FROM

# Installera Node.js, npm och git
RUN apk add --no-cache nodejs npm git bash

# Skapa app-mapp
WORKDIR /app

# Klona koden från GitHub
ARG CACHEBUST=37
RUN git clone https://github.com/S1887/Familjecentralen.git .

# Installera beroenden
RUN npm install

# Bygg frontend
RUN npm run build

# Exponera port
EXPOSE 3001

# Skapa run-script DIREKT i Dockerfilen (garanterar Unix line endings)
RUN mkdir -p /etc/services.d/familjecentralen && \
    printf '#!/bin/bash\necho "Starting Familjecentralen..."\ncd /app\nexec node server/index.js\n' > /etc/services.d/familjecentralen/run && \
    chmod +x /etc/services.d/familjecentralen/run
