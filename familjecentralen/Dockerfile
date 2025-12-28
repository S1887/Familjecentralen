FROM node:18-alpine

# Set correct work directory
WORKDIR /app

# Copy local files to container (ignores listed in .dockerignore)
COPY . .

# Install dependencies and build
RUN npm ci
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

EXPOSE 3001
CMD ["npm", "run", "server"]
