# 🚀 NetClass Backend Deployment Guide

## 📋 Prerequisites
- Ubuntu 24.04 server
- Domain names: allan.zivo.cloud, sandbox.allan.zivo.cloud
- SSH access with sudo privileges

## 🔧 Step 1: Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 and Nginx
sudo npm install -g pm2
sudo apt install nginx certbot python3-certbot-nginx -y

# Create deploy user
sudo adduser deploy
sudo usermod -aG sudo deploy

# Setup SSH keys (on your local machine)
ssh-keygen -t rsa -b 4096 -C "deploy@allan.zivo.cloud"
ssh-copy-id deploy@allan.zivo.cloud

# Disable root login
sudo nano /etc/ssh/sshd_config
# Set: PermitRootLogin no, PasswordAuthentication no
sudo systemctl restart ssh
```

## 🏗️ Step 2: Deploy Applications

```bash
# Clone repositories
sudo git clone https://github.com/allan4931/classroom-backend.git /var/www/allan-production
sudo git clone https://github.com/allan4931/classroom-backend.git /var/www/allan-sandbox

# Set permissions
sudo chown -R deploy:deploy /var/www/allan-*

# Production environment
sudo nano /var/www/allan-production/.env
```
```env
NODE_ENV=production
PORT=8001
FRONTEND_URL=https://allan.zivo.cloud
DATABASE_URL=your-production-db-url
JWT_SECRET=your-32-char-secret-1
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

```bash
# Sandbox environment
sudo nano /var/www/allan-sandbox/.env
```
```env
NODE_ENV=production
PORT=8002
FRONTEND_URL=https://sandbox.allan.zivo.cloud
DATABASE_URL=your-sandbox-db-url
JWT_SECRET=your-32-char-secret-2
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

```bash
# Build and start applications
cd /var/www/allan-production
npm ci --production
npm run build
pm2 start dist/index.js --name allan-production

cd /var/www/allan-sandbox
npm ci --production
npm run build
pm2 start dist/index.js --name allan-sandbox

# Setup PM2 startup
pm2 startup
pm2 save
```

## 🌐 Step 3: Configure Nginx

```bash
# Production config
sudo nano /etc/nginx/sites-available/allan.zivo.cloud
```
```nginx
server {
    listen 80;
    server_name allan.zivo.cloud;
    location / {
        proxy_pass http://localhost:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Sandbox config
sudo nano /etc/nginx/sites-available/sandbox.allan.zivo.cloud
```
```nginx
server {
    listen 80;
    server_name sandbox.allan.zivo.cloud;
    location / {
        proxy_pass http://localhost:8002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Enable sites
sudo ln -s /etc/nginx/sites-available/allan.zivo.cloud /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/sandbox.allan.zivo.cloud /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 🔒 Step 4: Setup HTTPS

```bash
# Get SSL certificates
sudo certbot --nginx -d allan.zivo.cloud
sudo certbot --nginx -d sandbox.allan.zivo.cloud

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## ✅ Step 5: Verification

```bash
# Test applications
curl http://localhost:8001/health
curl http://localhost:8002/health

# Test domains
curl https://allan.zivo.cloud/health
curl https://sandbox.allan.zivo.cloud/health

# Check PM2 status
pm2 status
```

## 🔄 Updates

```bash
# Update production
cd /var/www/allan-production
git pull
npm ci --production
npm run build
pm2 restart allan-production

# Update sandbox
cd /var/www/allan-sandbox
git pull
npm ci --production
npm run build
pm2 restart allan-sandbox
```

## 🎯 Result

- **Production:** https://allan.zivo.cloud (Port 8001)
- **Sandbox:** https://sandbox.allan.zivo.cloud (Port 8002)
- **Both with HTTPS and PM2 process management**
