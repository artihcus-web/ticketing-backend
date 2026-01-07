# Docker Hub Deployment Guide

This guide explains how to build and push the Articket Backend application to Docker Hub.

> **💡 For CI/CD Pipeline Setup:** See [CI_CD_SETUP.md](./CI_CD_SETUP.md) for automated build and deployment.

## Prerequisites

1. **Docker installed** on your machine
   - Download from: https://www.docker.com/products/docker-desktop
   - Verify installation: `docker --version`

2. **Docker Hub account**
   - Sign up at: https://hub.docker.com/
   - Note your Docker Hub username

## Step 1: Login to Docker Hub

```bash
docker login
```

Enter your Docker Hub username and password when prompted.

## Step 2: Build the Docker Image

Navigate to the backend directory:

```bash
cd backend
```

Build the image with a tag (replace `YOUR_DOCKERHUB_USERNAME` with your actual Docker Hub username):

```bash
docker build -t YOUR_DOCKERHUB_USERNAME/articket-backend:latest .
```

Or with a specific version:

```bash
docker build -t YOUR_DOCKERHUB_USERNAME/articket-backend:v1.0.0 .
```

## Step 3: Test the Image Locally (Optional)

Before pushing, you can test the image locally:

```bash
docker run -p 5000:5000 \
  -e MONGODB_URI="your_mongodb_connection_string" \
  -e PORT=5000 \
  -e JWT_SECRET="your_jwt_secret" \
  YOUR_DOCKERHUB_USERNAME/articket-backend:latest
```

## Step 4: Push to Docker Hub

Push the image to Docker Hub:

```bash
docker push YOUR_DOCKERHUB_USERNAME/articket-backend:latest
```

Or for a specific version:

```bash
docker push YOUR_DOCKERHUB_USERNAME/articket-backend:v1.0.0
```

## Step 5: Pull and Run on Server

On your server, pull and run the image:

```bash
# Pull the image
docker pull YOUR_DOCKERHUB_USERNAME/articket-backend:latest

# Run the container
docker run -d \
  --name articket-backend \
  -p 5000:5000 \
  -e MONGODB_URI="your_mongodb_connection_string" \
  -e PORT=5000 \
  -e JWT_SECRET="your_jwt_secret" \
  --restart unless-stopped \
  YOUR_DOCKERHUB_USERNAME/articket-backend:latest
```

## Using Docker Compose (Recommended)

For easier management, you can use Docker Compose. Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  backend:
    image: YOUR_DOCKERHUB_USERNAME/articket-backend:latest
    container_name: articket-backend
    ports:
      - "5000:5000"
    environment:
      - MONGODB_URI=${MONGODB_URI}
      - PORT=5000
      - JWT_SECRET=${JWT_SECRET}
    restart: unless-stopped
    networks:
      - articket-network

networks:
  articket-network:
    driver: bridge
```

Then run:

```bash
docker-compose up -d
```

## Environment Variables

Make sure to set these environment variables when running the container:

- `MONGODB_URI`: MongoDB connection string
- `PORT`: Server port (default: 5000)
- `JWT_SECRET`: Secret key for JWT token generation

You can pass them via:
- `-e` flags in `docker run`
- Environment file with `--env-file .env`
- Docker Compose `environment` section

## Updating the Image

When you make changes to the code:

1. **Commit and push to GitHub** (if using version control)
2. **Rebuild the image:**
   ```bash
   docker build -t YOUR_DOCKERHUB_USERNAME/articket-backend:latest .
   ```
3. **Push the updated image:**
   ```bash
   docker push YOUR_DOCKERHUB_USERNAME/articket-backend:latest
   ```
4. **On your server, pull and restart:**
   ```bash
   docker pull YOUR_DOCKERHUB_USERNAME/articket-backend:latest
   docker-compose restart backend
   # or
   docker restart articket-backend
   ```

## Tagging Versions

It's good practice to tag versions:

```bash
# Build with version tag
docker build -t YOUR_DOCKERHUB_USERNAME/articket-backend:v1.0.0 .

# Also tag as latest
docker tag YOUR_DOCKERHUB_USERNAME/articket-backend:v1.0.0 YOUR_DOCKERHUB_USERNAME/articket-backend:latest

# Push both
docker push YOUR_DOCKERHUB_USERNAME/articket-backend:v1.0.0
docker push YOUR_DOCKERHUB_USERNAME/articket-backend:latest
```

## Troubleshooting

### Check if image was built successfully
```bash
docker images | grep articket-backend
```

### View container logs
```bash
docker logs articket-backend
```

### Stop and remove container
```bash
docker stop articket-backend
docker rm articket-backend
```

### Remove old images
```bash
docker image prune -a
```

## Security Notes

- Never commit `.env` files or sensitive data to the image
- Use Docker secrets or environment variables for sensitive data
- Keep your Docker Hub account secure with 2FA
- Regularly update base images for security patches

