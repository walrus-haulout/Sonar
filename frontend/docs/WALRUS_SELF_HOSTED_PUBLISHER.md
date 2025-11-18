# Self-Hosted Walrus Publisher Setup Guide

## Overview

Running your own Walrus publisher node gives you **2-4x faster uploads** compared to the public publisher, with dedicated resources and optimizable parallelism.

### Why Self-Host?

| Metric | Public Publisher | Self-Hosted (N=32) | Self-Hosted (N=64) |
|--------|------------------|-------------------|-------------------|
| Sub-Wallets | 8 | 32 | 64 |
| Concurrent Uploads | 8 | 32 | 64 |
| Expected Speed | 1x (baseline) | **2-4x faster** | **4-8x faster** |
| Geographic Latency | Variable | Near your app | Near your app |
| Resource Contention | Shared | Dedicated | Dedicated |
| Cost | Free | $30-50/mo | $50-100/mo |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Your Frontend                           │
│  Sonar Audio Marketplace / App                          │
└──────────────┬──────────────────────────────────────────┘
               │
        (Change 1 env var)
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│         Your Self-Hosted Infrastructure                 │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Nginx Reverse Proxy (HTTPS)                    │   │
│  │  - publisher.yourdomain.com (Port 443)          │   │
│  │  - Forward to localhost:31416                   │   │
│  └──────────────┬──────────────────────────────────┘   │
│                 │                                        │
│  ┌──────────────▼──────────────────────────────────┐   │
│  │  Walrus Publisher Daemon                        │   │
│  │  - Bind: 0.0.0.0:31416 (localhost)              │   │
│  │  - N_CLIENTS: 32+ (configurable)                │   │
│  │  - Sub-wallets: 32+ funded with SUI/WAL         │   │
│  │  - Metrics: :9184 (Prometheus)                  │   │
│  └──────────────┬──────────────────────────────────┘   │
│                 │                                        │
└─────────────────┼────────────────────────────────────────┘
                  │
                  ▼
     ┌─────────────────────────────────┐
     │  Walrus Storage Nodes (~2200)    │
     │  - Sliver distribution           │
     │  - Erasure coding (Red Stuff)    │
     │  - Data persistence              │
     └─────────────────────────────────┘
```

---

## Infrastructure Requirements

### Minimum Setup (8 sub-wallets)
- **VPS**: 2 CPU cores, 4GB RAM
- **Storage**: 10GB (for metadata only, not blob data)
- **Bandwidth**: 50 Mbps recommended
- **Cost**: ~$10-20/month
- **Wallet Funding**: 8 SUI + 800 WAL

### Recommended Setup (32 sub-wallets)
- **VPS**: 4 CPU cores, 8GB RAM
- **Storage**: 20GB
- **Bandwidth**: 100 Mbps (critical for speed)
- **Cost**: ~$30-50/month
- **Wallet Funding**: 32 SUI + 3200 WAL

### High-Performance Setup (64 sub-wallets)
- **VPS**: 8 CPU cores, 16GB RAM
- **Storage**: 40GB
- **Bandwidth**: 200+ Mbps (essential)
- **Cost**: ~$80-150/month
- **Wallet Funding**: 64 SUI + 6400 WAL

### Recommended VPS Providers

1. **Hetzner Cloud** (Best price/performance)
   - CPX31 (4 cores, 8GB RAM, unlimited bandwidth): €20/month
   - Located in multiple regions globally

2. **DigitalOcean**
   - 4GB Basic ($20/month) + 5TB Transfer included
   - Premium support available

3. **AWS EC2**
   - t3.medium (2 cores, 4GB RAM): ~$30/month
   - Free tier available for testing

4. **Vultr**
   - High-performance cores, generous bandwidth
   - Hourly billing for flexibility

---

## Step-by-Step Setup

### 1. Provision VPS

```bash
# Choose your provider above and spin up a VPS with:
# - OS: Ubuntu 22.04 LTS
# - Location: Near your primary users or app servers
# - Security: Enable SSH key authentication only
# - Open ports: 22 (SSH), 80 (HTTP), 443 (HTTPS), 31416 (Walrus), 9184 (Metrics)

# SSH into your VPS
ssh root@your-vps-ip

# Update system
apt update && apt upgrade -y

# Install dependencies
apt install -y \
    curl \
    wget \
    jq \
    openssl \
    nginx \
    certbot \
    python3-certbot-nginx \
    docker.io \
    docker-compose
```

### 2. Download Walrus Binary

```bash
# Determine latest version
WALRUS_VERSION=$(curl -s https://api.github.com/repos/MystenLabs/walrus/releases/latest | jq -r '.tag_name')

# Download
cd /opt
curl -fLJO "https://github.com/MystenLabs/walrus/releases/download/${WALRUS_VERSION}/walrus"

# Make executable
chmod +x walrus
ln -s /opt/walrus /usr/local/bin/walrus

# Verify
walrus --version
```

### 3. Setup Directory Structure

```bash
# Create publisher user and directories
useradd -m -s /bin/bash walrus
mkdir -p /home/walrus/.config/walrus/publisher-wallets
mkdir -p /var/log/walrus
mkdir -p /var/lib/walrus/metrics

# Set ownership
chown -R walrus:walrus /home/walrus/.config/walrus
chown -R walrus:walrus /var/log/walrus
chown -R walrus:walrus /var/lib/walrus
```

### 4. Generate and Fund Sub-Wallets

```bash
# Switch to walrus user
sudo su - walrus

# Create sub-wallets
N_CLIENTS=32

for i in $(seq 1 $N_CLIENTS); do
    wallet_path="$HOME/.config/walrus/publisher-wallets/wallet-${i}.key"
    walrus keytool generate ed25519 --output "$wallet_path"
    echo "Created wallet ${i}"
done

# Get wallet addresses for funding
echo "Sub-wallet addresses (fund these with SUI and WAL):"
for i in $(seq 1 $N_CLIENTS); do
    wallet_path="$HOME/.config/walrus/publisher-wallets/wallet-${i}.key"
    walrus keytool show "$wallet_path" | grep "Address:"
done
```

**Now fund these wallets:**

You'll need to transfer:
- **SUI**: 0.5-1.0 SUI per wallet (for gas)
- **WAL**: 100-500 WAL per wallet (for storage fees)

Use your main wallet to transfer to all sub-wallet addresses. You can do this via:
- Sui CLI: `sui client transfer`
- Walrus CLI: `walrus client transfer`
- Sui Explorer Web UI: https://suiscan.io/

### 5. Configure Systemd Service

Create `/etc/systemd/system/walrus-publisher.service`:

```ini
[Unit]
Description=Walrus Publisher Node
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=walrus
WorkingDirectory=/home/walrus
Environment="HOME=/home/walrus"

ExecStart=/usr/local/bin/walrus publisher \
    --bind-address "0.0.0.0:31416" \
    --sub-wallets-dir "/home/walrus/.config/walrus/publisher-wallets" \
    --n-clients 32 \
    --max-concurrent-requests 1000 \
    --metrics-address "0.0.0.0:9184" \
    --network "mainnet"

Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=walrus-publisher

# Resource limits
LimitNOFILE=65535
LimitNPROC=65535

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable walrus-publisher
sudo systemctl start walrus-publisher

# Check status
sudo systemctl status walrus-publisher
sudo journalctl -u walrus-publisher -f  # Follow logs
```

### 6. Setup Nginx Reverse Proxy

Create `/etc/nginx/sites-available/walrus-publisher`:

```nginx
upstream walrus_publisher {
    server localhost:31416;
    keepalive 32;
}

server {
    listen 80;
    server_name publisher.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name publisher.yourdomain.com;

    # SSL certificates (setup with Certbot below)
    ssl_certificate /etc/letsencrypt/live/publisher.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/publisher.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Large file upload support
    client_max_body_size 10G;
    client_body_timeout 3600s;
    proxy_connect_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_read_timeout 3600s;

    # Disable buffering for streaming uploads
    proxy_buffering off;
    proxy_request_buffering off;

    location / {
        proxy_pass http://walrus_publisher;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/walrus-publisher /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 7. Setup SSL Certificate (Certbot)

```bash
# Install SSL certificate
sudo certbot certonly \
    --nginx \
    --non-interactive \
    --agree-tos \
    -m your-email@example.com \
    -d publisher.yourdomain.com

# Setup auto-renewal
sudo certbot renew --dry-run
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

### 8. Verify Deployment

```bash
# Check publisher is running
curl -s http://localhost:31416/v1/health | jq .

# Check through Nginx
curl -s https://publisher.yourdomain.com/v1/health | jq .

# Check metrics
curl -s http://localhost:9184/metrics | head -20

# Test with small file upload
curl -X PUT \
    -H "Content-Type: application/octet-stream" \
    --data-binary @testfile.bin \
    "https://publisher.yourdomain.com/v1/blobs?epochs=26"
```

---

## Update Your Frontend

### Change One Environment Variable

**File**: `frontend/.env` (or Vercel environment variables)

```env
# Before (public publisher):
NEXT_PUBLIC_WALRUS_PUBLISHER_URL=https://publisher.walrus-mainnet.walrus.space

# After (your publisher):
NEXT_PUBLIC_WALRUS_PUBLISHER_URL=https://publisher.yourdomain.com
```

**That's it!** No code changes needed. The upload code already uses this env var.

### Redeploy Frontend

```bash
# If using Vercel
vercel env pull
git add .env.local
git commit -m "Update Walrus publisher URL to self-hosted instance"
git push

# Vercel will auto-redeploy with new env vars
```

---

## Performance Tuning

### Increase Parallelism

For even faster uploads, increase `--n-clients`:

```ini
# In /etc/systemd/system/walrus-publisher.service
ExecStart=/usr/local/bin/walrus publisher \
    ...
    --n-clients 64  # Up from 32
    --max-concurrent-requests 2000  # Increase if needed
```

Then restart:

```bash
sudo systemctl daemon-reload
sudo systemctl restart walrus-publisher
```

### Monitor Resource Usage

```bash
# CPU/Memory during uploads
top

# Disk I/O
iostat -x 1

# Network traffic
iftop

# Logs
sudo journalctl -u walrus-publisher -f
```

### Performance Benchmarks

Compare with public publisher:

```bash
# Time an upload with public publisher
time curl -X PUT \
    -H "Content-Type: application/octet-stream" \
    --data-binary @largefile.bin \
    "https://publisher.walrus-mainnet.walrus.space/v1/blobs?epochs=26"

# Time same upload with your publisher
time curl -X PUT \
    -H "Content-Type: application/octet-stream" \
    --data-binary @largefile.bin \
    "https://publisher.yourdomain.com/v1/blobs?epochs=26"
```

Expected result: **Your publisher is 2-4x faster** for large files.

---

## Monitoring & Health Checks

### Prometheus Metrics

Your publisher exposes metrics at `http://localhost:9184/metrics`:

```bash
# Key metrics to monitor
curl -s http://localhost:9184/metrics | grep walrus

# Setup Prometheus to scrape
```

### Health Check

```bash
# This endpoint returns health status
curl -v https://publisher.yourdomain.com/v1/health

# Expected response: 200 OK
```

### Systemd Service Logs

```bash
# View recent logs
sudo journalctl -u walrus-publisher -n 100

# Follow logs in real-time
sudo journalctl -u walrus-publisher -f

# View logs from specific time
sudo journalctl -u walrus-publisher --since "10 minutes ago"
```

---

## Cost Breakdown

### Monthly Costs (32 Sub-Wallets)

| Component | Estimated Cost |
|-----------|-----------------|
| VPS (4-core, 8GB RAM) | $30-50 |
| Domain name | $10-12 |
| SSL certificate | Free (Let's Encrypt) |
| **Sub-wallet funding (SUI/WAL)** | **~$50-100** (variable) |
| **Total Monthly** | **~$90-160** |

### Cost Justification

For an audio marketplace:
- **Faster uploads** = Better user experience
- **Better UX** = Higher engagement
- **Higher engagement** = More revenue

**ROI breakeven**: Typically reached within weeks of deployment.

---

## Troubleshooting

### Publisher won't start

```bash
# Check if port 31416 is in use
sudo lsof -i :31416

# Check logs for errors
sudo journalctl -u walrus-publisher -n 50

# Check wallet funding
walrus client get-wallets  # May need to import wallets
```

### Slow uploads

```bash
# Check network latency
ping your-vps-ip

# Check bandwidth usage
iftop

# Monitor CPU
top

# If CPU maxed: Increase --max-concurrent-requests
# If bandwidth maxed: Upgrade VPS or reduce --n-clients
```

### Wallet balance too low

```bash
# Check sub-wallet balances
for i in {1..32}; do
    walrus client get-balance --wallet wallet-${i}
done

# Fund more SUI/WAL to sub-wallets
```

### Metrics endpoint not accessible

```bash
# Check if metrics service is listening
sudo lsof -i :9184

# Verify in systemd service: --metrics-address "0.0.0.0:9184"
```

---

## Security Considerations

### Production Recommendations

1. **Firewall Configuration**
   ```bash
   # Only allow HTTPS from your app servers / CDN
   sudo ufw allow from YOUR_APP_IP/32 to any port 443
   sudo ufw allow from CLOUDFLARE_IP/20 to any port 443
   sudo ufw allow 22  # SSH
   ```

2. **Backup Wallet Keys**
   ```bash
   # Backup /home/walrus/.config/walrus/publisher-wallets
   # Store securely (encrypted, off-site)
   ```

3. **Monitor Fund Depletion**
   ```bash
   # Alert when sub-wallet balance < threshold
   # Setup monitoring job to check balances
   ```

4. **Rate Limiting**
   ```nginx
   # In Nginx config
   limit_req_zone $binary_remote_addr zone=upload_limit:10m rate=100r/s;
   limit_req zone=upload_limit burst=200;
   ```

---

## Scaling Beyond Single Node

### Multi-Publisher Setup

For extremely high volume, run multiple publishers:

```
┌─────────────────────────┐
│   Load Balancer (DNS)   │
└──────────┬──────────────┘
           │
     ┌─────┴─────┬───────┐
     │           │       │
     ▼           ▼       ▼
Publisher 1  Pub 2  Pub 3 (in different regions)
```

Update frontend env var to load-balanced endpoint:

```env
NEXT_PUBLIC_WALRUS_PUBLISHER_URL=https://publishers.yourdomain.com
```

---

## Additional Resources

- **Walrus Docs**: https://docs.walrus.xyz
- **Sui RPC**: https://suiscan.io
- **Prometheus Metrics**: http://localhost:9184/metrics
- **Nginx Documentation**: https://nginx.org/en/docs/
- **Systemd Documentation**: https://www.freedesktop.org/software/systemd/man/

---

## Next Steps

1. ✅ Provision VPS
2. ✅ Install Walrus binary
3. ✅ Create and fund sub-wallets
4. ✅ Setup Systemd service
5. ✅ Configure Nginx + SSL
6. ✅ Test uploads via HTTPS
7. ✅ Update frontend env var
8. ✅ Monitor performance
9. ✅ Optimize if needed

**Expected Result**: 2-4x faster uploads with dedicated infrastructure and full control.

---

## Questions?

If you encounter issues:
1. Check Systemd logs: `sudo journalctl -u walrus-publisher -f`
2. Verify HTTPS certificate: `curl -v https://publisher.yourdomain.com`
3. Check wallet funding: `walrus client get-balance`
4. Review this guide's troubleshooting section
