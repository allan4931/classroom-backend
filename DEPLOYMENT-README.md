# 🚀 NetClass Production Deployment Guide

## 📋 Overview

This guide provides complete instructions for deploying the NetClass backend application to a Ubuntu 24.04 server with production-grade security, monitoring, and scalability.

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   allan.zivo.   │    │ sandbox.allan.  │    │   Ubuntu 24.04  │
│     cloud       │    │   zivo.cloud     │    │     Server      │
│                 │    │                 │    │                 │
│  Production     │    │   Sandbox       │    │                 │
│  Instance       │    │   Instance       │    │                 │
│  (Port 8001)    │    │  (Port 8002)    │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │      Nginx      │
                    │  Reverse Proxy  │
                    │   (Port 80/443) │
                    └─────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Let's Encrypt │
                    │   SSL Certs     │
                    └─────────────────┘
```

## 🔧 Prerequisites

- Ubuntu 24.04 server
- Domain names pointing to server IP
- SSH access with sudo privileges
- Node.js 18+ (will be installed)
- PostgreSQL database (Neon recommended)

## 📝 Quick Start

### 1. Server Setup
```bash
# Run the server setup script
sudo ./server-setup.sh
```

### 2. SSH Key Configuration
```bash
# On your local machine
ssh-keygen -t rsa -b 4096 -C "deploy@allan.zivo.cloud"
ssh-copy-id deploy@allan.zivo.cloud

# Test SSH login
ssh deploy@allan.zivo.cloud
```

### 3. Disable Root Login
```bash
# Edit SSH config
sudo nano /etc/ssh/sshd_config

# Set these values:
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes

# Restart SSH
sudo systemctl restart ssh
```

### 4. Deploy Applications
```bash
# Clone repositories
sudo git clone https://github.com/allan4931/classroom-backend.git /var/www/allan-production
sudo git clone https://github.com/allan4931/classroom-backend.git /var/www/allan-sandbox

# Configure environment files
sudo cp env-production.example /var/www/allan-production/.env
sudo cp env-sandbox.example /var/www/allan-sandbox/.env

# Edit environment files with your actual values
sudo nano /var/www/allan-production/.env
sudo nano /var/www/allan-sandbox/.env

# Deploy applications
./deploy.sh production
./deploy.sh sandbox
```

### 5. Configure Nginx
```bash
# Copy Nginx configurations
sudo cp nginx-production.conf /etc/nginx/sites-available/allan.zivo.cloud
sudo cp nginx-sandbox.conf /etc/nginx/sites-available/sandbox.allan.zivo.cloud

# Enable sites
sudo ln -s /etc/nginx/sites-available/allan.zivo.cloud /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/sandbox.allan.zivo.cloud /etc/nginx/sites-enabled/

# Test and restart Nginx
sudo nginx -t
sudo systemctl restart nginx
```

### 6. Setup SSL Certificates
```bash
# Run SSL setup script
sudo ./ssl-setup.sh
```

## 📁 File Structure

```
classroom-backend/
├── deploy.sh                    # Deployment script
├── server-setup.sh              # Initial server setup
├── ssl-setup.sh                 # SSL certificate setup
├── monitor.sh                   # Monitoring script
├── ecosystem.config.js          # PM2 configuration
├── nginx-production.conf        # Nginx config for production
├── nginx-sandbox.conf          # Nginx config for sandbox
├── env-production.example       # Production env template
├── env-sandbox.example         # Sandbox env template
└── src/                        # Application source code
```

## 🔧 Configuration Files

### Environment Variables

**Production (.env):**
- `PORT=8001`
- `FRONTEND_URL=https://allan.zivo.cloud`
- `DATABASE_URL=postgresql://...`
- `JWT_SECRET=32-char-secret-1`
- `SMTP_USER=your-email@gmail.com`

**Sandbox (.env):**
- `PORT=8002`
- `FRONTEND_URL=https://sandbox.allan.zivo.cloud`
- `DATABASE_URL=postgresql://...`
- `JWT_SECRET=32-char-secret-2`

### Nginx Configuration

Both configurations include:
- HTTP to HTTPS redirect
- SSL termination
- Security headers
- Rate limiting
- Health check endpoints
- Static file caching

## 🚀 Deployment Scripts

### deploy.sh
Automated deployment with:
- Git pull and build
- PM2 process management
- Health checks
- Rollback capability
- Backup creation

**Usage:**
```bash
./deploy.sh production [branch]
./deploy.sh sandbox [branch]
```

### monitor.sh
Comprehensive health monitoring:
- Application health checks
- PM2 process status
- SSL certificate expiry
- System resources
- Error log analysis

**Usage:**
```bash
./monitor.sh
```

## 🔒 Security Features

### Server Security
- SSH key authentication only
- Disabled root login
- UFW firewall configured
- Fail2Ban (optional)

### Application Security
- HTTPS with Let's Encrypt
- Security headers
- Rate limiting
- Bot protection (Arcjet)
- Input validation
- SQL injection protection

### Infrastructure Security
- Environment variable isolation
- Database SSL connections
- Secure JWT secrets
- Password hashing

## 📊 Monitoring

### PM2 Monitoring
```bash
pm2 status                    # Process status
pm2 logs allan-production    # Production logs
pm2 logs allan-sandbox       # Sandbox logs
pm2 monit                    # Real-time monitoring
```

### System Monitoring
```bash
./monitor.sh                 # Comprehensive health check
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### SSL Certificate Monitoring
```bash
certbot certificates         # Certificate status
certbot renew --dry-run      # Test renewal
```

## 🔄 Maintenance

### Daily Tasks
- Monitor application health
- Check error logs
- Verify SSL certificates

### Weekly Tasks
- Update dependencies
- Review system resources
- Backup database

### Monthly Tasks
- Security updates
- Performance optimization
- Log rotation verification

## 🚨 Troubleshooting

### Common Issues

**Application not starting:**
```bash
pm2 logs allan-production    # Check logs
pm2 restart allan-production # Restart process
```

**SSL certificate issues:**
```bash
sudo certbot renew           # Renew certificates
sudo nginx -t                # Test Nginx config
```

**Database connection issues:**
```bash
# Check DATABASE_URL in .env
# Verify database is accessible
curl -I http://localhost:8001/health
```

**High memory usage:**
```bash
pm2 restart all              # Restart all processes
pm2 delete allan-production  # Remove and redeploy
./deploy.sh production       # Redeploy
```

## 📈 Performance Optimization

### Nginx Optimization
- Gzip compression enabled
- Static file caching
- Connection pooling
- Rate limiting

### Application Optimization
- PM2 clustering (if needed)
- Memory limits configured
- Auto-restart on crashes
- Graceful shutdown

### Database Optimization
- Connection pooling
- Query optimization
- Index optimization
- Regular maintenance

## 🔄 CI/CD Integration

### GitHub Actions Example
```yaml
name: Deploy to Production
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to server
        run: |
          ssh deploy@allan.zivo.cloud \
            "cd /var/www/allan-production && ./deploy.sh production"
```

## 📞 Support

### Emergency Contacts
- Server admin: deploy@allan.zivo.cloud
- Monitoring alerts: Configure email/SMS

### Documentation
- Application logs: `/var/log/pm2/`
- Nginx logs: `/var/log/nginx/`
- System logs: `/var/log/syslog`

### Recovery Procedures
1. Check application health
2. Review error logs
3. Restart services if needed
4. Restore from backup if required
5. Contact support if issues persist

## 🎯 Success Criteria

- [ ] Both domains accessible via HTTPS
- [ ] Applications responding to health checks
- [ ] SSL certificates valid and auto-renewing
- [ ] Monitoring scripts working
- [ ] Security configurations applied
- [ ] Performance metrics acceptable
- [ ] Backup procedures tested

---

**🚀 Your NetClass application is now production-ready!**
