# SpaceGuard Production Deployment Guide

## Prerequisites

- Linux server (Ubuntu 22.04+ recommended) with Docker Engine 24+ and Docker Compose V2
- Domain name pointing to the server's IP address
- Ports 80 and 443 open in the firewall
- At least 2 GB RAM, 2 CPU cores

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-org/spaceguard.git
cd spaceguard

# 2. Create production environment file
cp .env.production.example .env.production

# 3. Generate secrets and update .env.production
openssl rand -hex 32   # Use for JWT_SECRET
openssl rand -hex 32   # Use for ENCRYPTION_KEY
openssl rand -base64 24  # Use for POSTGRES_PASSWORD
openssl rand -base64 24  # Use for REDIS_PASSWORD

# 4. Edit .env.production with your values
nano .env.production

# 5. Deploy
./scripts/deploy.sh
```

## Environment Variables

All variables are documented in `.env.production.example`. The critical ones:

| Variable | Description | How to generate |
|---|---|---|
| `DOMAIN` | Your public domain | e.g. `spaceguard.example.com` |
| `POSTGRES_PASSWORD` | Database password | `openssl rand -base64 24` |
| `REDIS_PASSWORD` | Redis password | `openssl rand -base64 24` |
| `JWT_SECRET` | JWT signing key (64 hex chars) | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | AES-256 key for data at rest (64 hex chars) | `openssl rand -hex 32` |
| `NEXT_PUBLIC_API_URL` | Public API URL for browser | `https://your-domain.com` |
| `CERTBOT_EMAIL` | Email for Let's Encrypt notifications | Your email address |

## Architecture

```
Internet
  |
  v
[nginx :80/:443]  -- SSL termination, rate limiting, routing
  |         |
  v         v
[web :3000]  [api :3001]
              |       |
              v       v
         [postgres]  [redis]
```

All services run on an internal Docker network. Only nginx exposes ports 80 and 443 to the host.

## SSL Setup

On first deploy, the script generates a self-signed certificate so nginx can start. To install a real Let's Encrypt certificate:

```bash
# Ensure DOMAIN and CERTBOT_EMAIL are set in .env.production
./scripts/deploy.sh setup-ssl
```

Set up automatic renewal via cron:

```bash
crontab -e
# Add this line:
0 3 * * * cd /path/to/spaceguard && ./scripts/deploy.sh renew-ssl >> /var/log/spaceguard-ssl.log 2>&1
```

## Common Operations

```bash
# View logs (all services)
./scripts/deploy.sh logs

# View logs for a specific service
./scripts/deploy.sh logs api
./scripts/deploy.sh logs web

# Check service status
./scripts/deploy.sh status

# Stop everything
./scripts/deploy.sh stop

# Run database migrations
./scripts/deploy.sh migrate

# Rebuild and redeploy after code changes
git pull origin main
./scripts/deploy.sh
```

## Database Backups

Automate daily backups with a cron job:

```bash
# Daily backup at 2 AM
0 2 * * * docker exec spaceguard-db-prod pg_dump -U spaceguard spaceguard | gzip > /backups/spaceguard-$(date +\%Y\%m\%d).sql.gz
```

To restore from backup:

```bash
gunzip -c /backups/spaceguard-20260327.sql.gz | docker exec -i spaceguard-db-prod psql -U spaceguard spaceguard
```

## Resource Requirements

Minimum recommended for production:

| Service | CPU | Memory |
|---|---|---|
| PostgreSQL + TimescaleDB | 1 core | 1 GB |
| Redis | 0.25 core | 256 MB |
| API (Hono) | 0.5 core | 512 MB |
| Web (Next.js) | 0.5 core | 512 MB |
| Nginx | 0.1 core | 64 MB |
| **Total** | **~2.5 cores** | **~2.3 GB** |

For production workloads with multiple organizations, scale to 4 cores / 4 GB.

## Troubleshooting

**Services fail to start:** Check logs with `./scripts/deploy.sh logs`. Most common cause is missing environment variables in `.env.production`.

**502 Bad Gateway:** API or web service is not yet healthy. Wait 30 seconds and retry. Check `./scripts/deploy.sh status` to confirm all services show "healthy".

**SSL certificate issues:** Verify your domain's DNS A record points to the server. Check certbot logs: `docker logs spaceguard-certbot`.

**Database connection errors:** Ensure PostgreSQL is healthy: `docker exec spaceguard-db-prod pg_isready -U spaceguard`. Check that `DATABASE_URL` in the API container matches the Postgres credentials.

## Security Checklist

Before going to production, verify:

- [ ] All default passwords in `.env.production` have been changed
- [ ] `JWT_SECRET` and `ENCRYPTION_KEY` are cryptographically random (64 hex chars each)
- [ ] SSL certificate is installed (not self-signed)
- [ ] Firewall only allows ports 80, 443, and SSH
- [ ] Database is not exposed on any public port
- [ ] Redis is not exposed on any public port
- [ ] Server OS is up to date with security patches
- [ ] Automated backups are configured and tested
- [ ] SSL auto-renewal cron job is active
