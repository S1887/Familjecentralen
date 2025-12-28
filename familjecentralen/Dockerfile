FROM node:18-alpine

# Set correct work directory
WORKDIR /app

# Install git to clone source
RUN apk add --no-cache git

# Clone the repository to a temporary directory first to avoid "non-empty directory" errors
ENV APP_VERSION=3.0.44
RUN git clone https://github.com/S1887/Familjecentralen /tmp/repo && \
    cp -r /tmp/repo/* . && \
    cp -r /tmp/repo/.* . 2>/dev/null || true && \
    rm -rf /tmp/repo

# Install dependencies and build
RUN npm ci
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

EXPOSE 3001
CMD ["npm", "run", "server"]
