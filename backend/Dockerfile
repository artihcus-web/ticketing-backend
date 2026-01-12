# Use Node.js 20 Alpine for a small footprint
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files first to leverage Docker cache for dependencies
COPY package*.json ./

# Install production dependencies only
RUN npm install --only=production

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on (5000 is default in code, but we can override)
EXPOSE 5000

# Start command
CMD ["npm", "start"]
