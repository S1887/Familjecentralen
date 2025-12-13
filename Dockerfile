FROM node:18-alpine

WORKDIR /app

# Install dependencies (only what's needed)
COPY package.json package-lock.json ./
# Use --production false to ensure 'devDependencies' (like Vite) are installed for the build step
# Or just npm install which installs everything.
# Since we build inside the image, we need devDependencies.
RUN npm install

# Copy source
COPY . .

# Build frontend
RUN npm run build

# Prune dev dependencies to save space (optional but good practice)
# RUN npm prune --production

# Expose port
EXPOSE 3001

# Start command
CMD ["npm", "run", "server"]
