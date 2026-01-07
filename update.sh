#!/bin/bash

# Update script for Articket Backend
# This script pulls the latest Docker image and restarts the container

set -e

echo "🔄 Updating Articket Backend..."

# Navigate to backend directory
cd "$(dirname "$0")" || exit 1

# Check if docker-compose.yml exists
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Error: docker-compose.yml not found!"
    exit 1
fi

# Pull latest image
echo "📥 Pulling latest Docker image..."
docker-compose pull

# Restart services
echo "🔄 Restarting services..."
docker-compose up -d

# Clean up old images
echo "🧹 Cleaning up old images..."
docker image prune -f

# Show status
echo "📊 Container status:"
docker-compose ps

echo "✅ Update completed successfully!"
echo "📋 View logs with: docker-compose logs -f"


