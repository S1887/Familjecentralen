FROM node:18-alpine

# Set correct work directory
WORKDIR /app

# Install git to clone source
RUN apk add --no-cache git

# Clone the repository to specifically get the root content
# We use a build arg or env to bust cache if needed
ENV APP_VERSION=3.0.43
RUN git clone https://github.com/S1887/Familjecentralen .

# Install dependencies and build
RUN npm ci
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

EXPOSE 3001
CMD ["npm", "run", "server"]
