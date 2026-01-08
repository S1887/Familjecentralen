FROM node:20-alpine

# Set memory limit to avoid OOM in CI
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Set correct work directory
WORKDIR /app

# Copy local files to container (ignores listed in .dockerignore)
COPY . .

# Install dependencies and build
RUN npm ci
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

EXPOSE 8443
CMD ["npm", "run", "server"]
