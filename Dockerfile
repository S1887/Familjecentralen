FROM node:18-alpine AS builder
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY . .

# Build frontend
RUN npm run build

# --- Production Stage ---
FROM node:18-alpine
WORKDIR /app

# Copy backend dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy backend source
COPY server ./server

# Copy built frontend from builder stage
COPY --from=builder /app/dist ./dist

# Create data directory for persistent storage (e.g. MongoDB/NeDB files)
RUN mkdir -p /data && chown node:node /data
ENV DATA_DIR=/data

# Expose port
EXPOSE 3001

# Run as non-root user
USER node

# Start server
CMD ["node", "server/index.js"]
