FROM node:18-alpine

# Install git ensure we can clone
RUN apk add --no-cache git

WORKDIR /app

# Clone the repository to get source code (since we are in a subdir context)
RUN git clone https://github.com/S1887/Familjecentralen .

# Install dependencies and build
RUN npm ci
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

EXPOSE 3001
CMD ["npm", "run", "serve"]
