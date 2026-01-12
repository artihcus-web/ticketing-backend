# CI/CD Pipeline Setup Guide

This guide will help you set up an automated CI/CD pipeline using GitHub Actions that will:
1. **Automatically build** a Docker image when you push code to GitHub
2. **Automatically push** the image to Docker Hub
3. **Optionally deploy** to your server automatically

## Prerequisites

1. **GitHub repository** (you already have this)
2. **Docker Hub account** - Sign up at https://hub.docker.com/
3. **Docker Hub Access Token** (for CI/CD authentication)

## Step 1: Create Docker Hub Access Token

1. Go to https://hub.docker.com/settings/security
2. Click **"New Access Token"**
3. Give it a name (e.g., "GitHub Actions CI/CD")
4. Set permissions to **"Read, Write, Delete"**
5. Copy the token (you'll need it in the next step)

## Step 2: Configure GitHub Secrets

1. Go to your GitHub repository: `https://github.com/YOUR_USERNAME/ticketing-backend`
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **"New repository secret"** and add the following:

   | Secret Name | Value | Description |
   |------------|-------|-------------|
   | `DOCKERHUB_USERNAME` | `your-dockerhub-username` | Your Docker Hub username |
   | `DOCKERHUB_TOKEN` | `your-access-token` | The access token from Step 1 |

   **Example:**
   - Secret Name: `DOCKERHUB_USERNAME`
   - Secret Value: `artihcus`

   - Secret Name: `DOCKERHUB_TOKEN`
   - Secret Value: `dckr_pat_xxxxxxxxxxxxx` (your token)

## Step 3: Verify Workflow Files

The CI/CD workflow files are already created:
- `.github/workflows/docker-build-push.yml` - Builds and pushes to Docker Hub
- `.github/workflows/deploy.yml` - Optional: Auto-deploys to server

## Step 4: Test the Pipeline

1. **Commit and push the workflow files:**
   ```bash
   git add .github/
   git commit -m "Add CI/CD pipeline"
   git push origin main
   ```

2. **Check GitHub Actions:**
   - Go to your repository on GitHub
   - Click the **"Actions"** tab
   - You should see a workflow run starting
   - Wait for it to complete (should take 2-5 minutes)

3. **Verify on Docker Hub:**
   - Go to https://hub.docker.com/r/YOUR_USERNAME/articket-backend
   - You should see the new image tagged as `latest`

## Step 5: Set Up Server Deployment

### Option A: Manual Pull (Simplest)

On your server, create a simple script to pull and restart:

```bash
# Create update script
cat > /data/ticketing-backend/update.sh << 'EOF'
#!/bin/bash
cd /data/ticketing-backend
docker-compose pull
docker-compose up -d
docker image prune -f
echo "✅ Backend updated successfully"
EOF

chmod +x /data/ticketing-backend/update.sh
```

Then whenever you want to update:
```bash
/data/ticketing-backend/update.sh
```

### Option B: Automatic Deployment (Advanced)

If you want automatic deployment after each push:

1. **Generate SSH Key for GitHub Actions:**
   ```bash
   # On your server
   ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_actions
   cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys
   ```

2. **Add GitHub Secrets:**
   - `SERVER_HOST`: Your server IP or domain
   - `SERVER_USER`: SSH username (usually `root`)
   - `SERVER_SSH_KEY`: Contents of `~/.ssh/github_actions` (private key)
   - `SERVER_PORT`: SSH port (usually `22`)

3. **The deploy workflow will automatically run** after successful builds

## Step 6: Server Setup with Docker Compose

On your server:

1. **Create docker-compose.yml:**
   ```bash
   cd /data/ticketing-backend
   # Copy the docker-compose.yml file or create it
   ```

2. **Create .env file:**
   ```bash
   cat > .env << EOF
   DOCKERHUB_USERNAME=your-dockerhub-username
   MONGODB_URI=your_mongodb_connection_string
   PORT=5000
   JWT_SECRET=your_jwt_secret
   EOF
   ```

3. **Start the container:**
   ```bash
   docker-compose up -d
   ```

## Workflow Overview

```
┌─────────────────┐
│  Push to GitHub  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│  GitHub Actions Trigger │
│  (docker-build-push.yml)│
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Build Docker Image     │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Push to Docker Hub     │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  (Optional) Deploy      │
│  to Server via SSH      │
└─────────────────────────┘
```

## Daily Workflow

Now your workflow is simple:

1. **Make code changes locally**
2. **Commit and push:**
   ```bash
   git add .
   git commit -m "Your changes"
   git push origin main
   ```
3. **GitHub Actions automatically:**
   - Builds the Docker image
   - Pushes to Docker Hub
4. **On your server, run:**
   ```bash
   /data/ticketing-backend/update.sh
   ```
   Or if using auto-deploy, it happens automatically!

## Monitoring

- **GitHub Actions:** Check the "Actions" tab in your repository
- **Docker Hub:** Check your repository at `https://hub.docker.com/r/YOUR_USERNAME/articket-backend`
- **Server Logs:** `docker-compose logs -f backend`

## Troubleshooting

### Workflow fails to build
- Check GitHub Actions logs for errors
- Verify Docker Hub secrets are correct
- Check Dockerfile syntax

### Image not appearing on Docker Hub
- Verify `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` secrets
- Check Docker Hub repository name matches
- Ensure Docker Hub account has permission to create repositories

### Server deployment fails
- Verify SSH key is correct
- Check server connectivity
- Ensure docker-compose.yml exists on server

## Advanced: Version Tagging

The workflow automatically creates tags:
- `latest` - Always points to the latest main branch build
- `main-<sha>` - Specific commit SHA
- You can also manually tag versions in GitHub releases

## Security Best Practices

1. ✅ Never commit secrets to the repository
2. ✅ Use GitHub Secrets for sensitive data
3. ✅ Use Docker Hub access tokens (not passwords)
4. ✅ Regularly rotate access tokens
5. ✅ Use SSH keys for server deployment (not passwords)
6. ✅ Keep Docker images updated with security patches

