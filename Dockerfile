# Use Node.js LTS version
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --only=production --legacy-peer-deps || npm install --only=production --legacy-peer-deps

# Copy application code
COPY . .

# Expose port
EXPOSE 5000

# Set environment to production
ENV NODE_ENV=production

# Start the application
CMD ["node", "server.js"]

