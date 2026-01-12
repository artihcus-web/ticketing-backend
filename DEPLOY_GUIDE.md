# Deployment Guide

This guide details how to deploy your **Articket** application to your existing server (`97.77.20.150`) alongside your current application.

## 1. Project Setup
I have created the following files for you:
- `backend/Dockerfile`: Instructions to build your backend.
- `docker-compose.prod.yml`: Configuration to run the backend and a new MongoDB container.
- `nginx-backend.conf`: Configuration snippet for your Nginx server.
- `.github/workflows/deploy.yml`: Automated deployment pipeline.

## 2. Server Preparation (Run on Server)

**Step 2.1: Create Directory**
SSH into your server and create the directory:
```bash
ssh root@97.77.20.150
mkdir -p /data/articket
```

**Step 2.2: Configure Nginx**
On your server (`97.77.20.150`), add the configuration from `nginx-backend.conf` to your Nginx setup.
You can create a new file or append to an existing one.

*Example:*
```bash
nano /etc/nginx/conf.d/articket.conf
# Paste contents of nginx-backend.conf here
```

**Step 2.3: Reload Nginx**
```bash
nginx -t  # Test configuration
systemctl reload nginx
```

## 3. GitHub Secrets Setup
Go to your **GitHub Repository Settings > Secrets and variables > Actions** and add the following:

| Secret Name | Value |
|-------------|-------|
| `DOCKER_USERNAME` | Your Docker Hub Username |
| `DOCKER_PASSWORD` | Your Docker Hub Access Token |
| `SERVER_IP` | `97.77.20.150` |
| `SERVER_USER` | `root` |
| `SERVER_SSH_KEY` | Your **Private** SSH Key content (allows access to the server) |
| `JWT_SECRET` | A long, random string for security |

## 4. Frontend Deployment (Vercel)
Since you are using Vercel for the frontend:
1.  Import your GitHub repository into Vercel.
2.  Set the **Root Directory** to `frontend`.
3.  Add Environment Variable in Vercel:
    - `VITE_API_BASE_URL`: `https://ticketing.artihcus.com:8443` (or just `https://ticketing.artihcus.com` if you map 8443 externally).

## 5. Router Port Forwarding
You need to forward external traffic to your Nginx server.
- **Protocol**: TCP
- **External Port**: `8443`
- **Internal IP**: `192.168.0.233`
- **Internal Port**: `8443` (Since our Nginx config listens on 8443 SSL)

## 6. Deployment
Once everything is set up:
1.  Push your code to the `main` branch.
2.  Go to the **Actions** tab in GitHub to see the deployment running.
3.  Once green, your backend is live!
