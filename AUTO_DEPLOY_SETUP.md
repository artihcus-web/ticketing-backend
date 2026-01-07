# Auto-Deploy Setup Guide

This guide will help you set up automatic deployment from GitHub Actions to your server.

## Prerequisites

- Server with SSH access
- Docker and Docker Compose installed on server
- GitHub repository with Actions enabled

## Step 1: Generate SSH Key for GitHub Actions

On your **local machine** or **server**, generate a dedicated SSH key:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_actions_deploy
```

**Important:** Don't set a passphrase (press Enter when prompted).

This creates:
- `~/.ssh/github_actions_deploy` (private key) - Add this to GitHub Secrets
- `~/.ssh/github_actions_deploy.pub` (public key) - Add this to your server

## Step 2: Add Public Key to Server

Copy the **public key** to your server's authorized_keys:

```bash
# On your local machine, display the public key
cat ~/.ssh/github_actions_deploy.pub

# Copy the output, then SSH to your server and add it:
ssh root@your-server-ip
mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo "PASTE_PUBLIC_KEY_HERE" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Or use `ssh-copy-id`:

```bash
ssh-copy-id -i ~/.ssh/github_actions_deploy.pub root@your-server-ip
```

## Step 3: Test SSH Connection

Test that the key works:

```bash
ssh -i ~/.ssh/github_actions_deploy root@your-server-ip
```

If it connects without a password, you're good!

## Step 4: Add GitHub Secrets

1. Go to your repository: `https://github.com/artihcus-web/ticketing-backend`
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **"New repository secret"** and add:

### Secret 1: SERVER_HOST
- **Name:** `SERVER_HOST`
- **Value:** Your server IP or domain (e.g., `192.168.0.233` or `ticketing.artihcus.com`)

### Secret 2: SERVER_USER
- **Name:** `SERVER_USER`
- **Value:** SSH username (usually `root`)

### Secret 3: SERVER_SSH_KEY
- **Name:** `SERVER_SSH_KEY`
- **Value:** The **entire contents** of `~/.ssh/github_actions_deploy` (the private key)
  ```bash
  cat ~/.ssh/github_actions_deploy
  ```
  Copy the entire output including `-----BEGIN OPENSSH PRIVATE KEY-----` and `-----END OPENSSH PRIVATE KEY-----`

### Secret 4: SERVER_PORT (Optional)
- **Name:** `SERVER_PORT`
- **Value:** SSH port (usually `22`, only add if different)

## Step 5: Verify Server Setup

On your server, make sure:

1. **Docker Compose is installed:**
   ```bash
   docker-compose --version
   ```

2. **The directory exists:**
   ```bash
   ls -la /data/ticketing-backend
   ```

3. **docker-compose.yml exists:**
   ```bash
   ls -la /data/ticketing-backend/docker-compose.yml
   ```

4. **.env file exists with required variables:**
   ```bash
   cat /data/ticketing-backend/.env
   ```
   
   Should contain:
   ```
   DOCKERHUB_USERNAME=your-dockerhub-username
   MONGODB_URI=your_mongodb_uri
   PORT=5000
   JWT_SECRET=your_jwt_secret
   ```

## Step 6: Test the Deployment

1. **Make a small change** to trigger the workflow (or manually trigger it)
2. **Check GitHub Actions:**
   - Go to: `https://github.com/artihcus-web/ticketing-backend/actions`
   - Watch the "Deploy to Server" workflow run

3. **Check server logs:**
   ```bash
   ssh root@your-server-ip
   cd /data/ticketing-backend
   docker-compose logs -f
   ```

## Troubleshooting

### SSH Connection Fails

**Check:**
- Public key is in `~/.ssh/authorized_keys` on server
- Permissions: `chmod 600 ~/.ssh/authorized_keys` and `chmod 700 ~/.ssh`
- SSH service is running: `systemctl status ssh`

**Test manually:**
```bash
ssh -i ~/.ssh/github_actions_deploy -v root@your-server-ip
```

### Docker Commands Fail

**Check:**
- Docker is running: `systemctl status docker`
- User has Docker permissions (or run as root)
- docker-compose.yml syntax is correct

### Permission Denied

**On server, ensure:**
```bash
chmod 755 /data/ticketing-backend
chmod 644 /data/ticketing-backend/docker-compose.yml
```

### Workflow Still Skipping

Check the workflow condition in `.github/workflows/deploy.yml`. It should run if:
- The build workflow succeeded
- All required secrets are set

## Security Best Practices

1. ✅ Use a dedicated SSH key for GitHub Actions (not your personal key)
2. ✅ Restrict SSH key permissions on server if possible
3. ✅ Use SSH keys without passphrases for CI/CD
4. ✅ Regularly rotate SSH keys
5. ✅ Monitor GitHub Actions logs for unauthorized access
6. ✅ Consider using SSH key restrictions (e.g., `command=` in authorized_keys)

## Quick Reference

**Generate key:**
```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_actions_deploy
```

**Add to server:**
```bash
ssh-copy-id -i ~/.ssh/github_actions_deploy.pub root@your-server-ip
```

**Get private key for GitHub:**
```bash
cat ~/.ssh/github_actions_deploy
```

**Test connection:**
```bash
ssh -i ~/.ssh/github_actions_deploy root@your-server-ip
```


 