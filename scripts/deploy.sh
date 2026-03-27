#!/usr/bin/env bash
# =============================================================================
# SpaceGuard - Production Deployment Script
# Usage:
#   ./scripts/deploy.sh              # Full deploy (build + start)
#   ./scripts/deploy.sh setup-ssl    # First-time SSL certificate setup
#   ./scripts/deploy.sh renew-ssl    # Renew SSL certificates
#   ./scripts/deploy.sh stop         # Stop all services
#   ./scripts/deploy.sh logs         # Tail all logs
#   ./scripts/deploy.sh status       # Show service status
#   ./scripts/deploy.sh migrate      # Run database migrations
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.prod.yml"
ENV_FILE="$PROJECT_ROOT/.env.production"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# Check prerequisites
check_prereqs() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi

    if ! docker compose version &> /dev/null; then
        log_error "Docker Compose V2 is not available"
        exit 1
    fi

    if [ ! -f "$ENV_FILE" ]; then
        log_error ".env.production not found. Copy .env.production.example and fill in values:"
        log_error "  cp .env.production.example .env.production"
        exit 1
    fi
}

# Load environment
load_env() {
    set -a
    # shellcheck source=/dev/null
    source "$ENV_FILE"
    set +a
}

# Generate self-signed cert for initial startup (before Let's Encrypt)
generate_self_signed() {
    local ssl_dir="$PROJECT_ROOT/nginx/ssl"
    mkdir -p "$ssl_dir"

    if [ ! -f "$ssl_dir/fullchain.pem" ]; then
        log_info "Generating self-signed certificate for initial startup..."
        openssl req -x509 -nodes -newkey rsa:2048 \
            -keyout "$ssl_dir/privkey.pem" \
            -out "$ssl_dir/fullchain.pem" \
            -subj "/CN=localhost" \
            -days 30
        log_info "Self-signed certificate created (valid 30 days)"
    fi
}

# Full deploy
deploy() {
    check_prereqs
    load_env

    log_info "Starting SpaceGuard production deployment..."

    # Ensure SSL directory and certs exist
    mkdir -p "$PROJECT_ROOT/nginx/ssl" "$PROJECT_ROOT/nginx/certbot"
    generate_self_signed

    # Build images
    log_info "Building Docker images..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build

    # Start services
    log_info "Starting services..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

    # Wait for API to be healthy
    log_info "Waiting for services to be healthy..."
    local retries=30
    while [ $retries -gt 0 ]; do
        if docker compose -f "$COMPOSE_FILE" ps --format json | grep -q '"Health":"healthy"'; then
            break
        fi
        retries=$((retries - 1))
        sleep 2
    done

    log_info "Running database migrations..."
    docker compose -f "$COMPOSE_FILE" exec api \
        node -e "
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);
migrate(db, { migrationsFolder: './apps/api/src/db/migrations' })
  .then(() => { console.log('Migrations complete'); pool.end(); })
  .catch(e => { console.error(e); pool.end(); process.exit(1); });
" || log_warn "Migration step failed or not applicable"

    log_info "Deployment complete!"
    docker compose -f "$COMPOSE_FILE" ps
}

# SSL setup with Let's Encrypt
setup_ssl() {
    check_prereqs
    load_env

    local domain="${DOMAIN:?Set DOMAIN in .env.production}"
    local email="${CERTBOT_EMAIL:?Set CERTBOT_EMAIL in .env.production}"

    log_info "Setting up SSL for $domain..."

    # Ensure nginx is running with self-signed cert for ACME challenge
    mkdir -p "$PROJECT_ROOT/nginx/ssl" "$PROJECT_ROOT/nginx/certbot"
    generate_self_signed

    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d nginx

    # Request certificate
    log_info "Requesting Let's Encrypt certificate..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm certbot \
        certbot certonly --webroot \
        --webroot-path=/var/www/certbot \
        --email "$email" \
        --agree-tos \
        --no-eff-email \
        -d "$domain"

    # Copy certs to nginx ssl directory
    log_info "Installing certificate..."
    docker compose -f "$COMPOSE_FILE" exec certbot \
        cp /etc/letsencrypt/live/"$domain"/fullchain.pem /etc/letsencrypt/fullchain.pem 2>/dev/null || true
    docker compose -f "$COMPOSE_FILE" exec certbot \
        cp /etc/letsencrypt/live/"$domain"/privkey.pem /etc/letsencrypt/privkey.pem 2>/dev/null || true

    # Reload nginx
    docker compose -f "$COMPOSE_FILE" exec nginx nginx -s reload

    log_info "SSL setup complete for $domain"
    log_info "Set up auto-renewal with: crontab -e"
    log_info "  0 3 * * * cd $PROJECT_ROOT && ./scripts/deploy.sh renew-ssl"
}

# Renew SSL certificates
renew_ssl() {
    check_prereqs
    load_env

    log_info "Renewing SSL certificates..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile ssl up certbot
    docker compose -f "$COMPOSE_FILE" exec nginx nginx -s reload
    log_info "SSL renewal complete"
}

# Stop all services
stop() {
    check_prereqs
    log_info "Stopping all services..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down
    log_info "All services stopped"
}

# Show logs
logs() {
    docker compose -f "$COMPOSE_FILE" logs -f --tail=100 "$@"
}

# Show status
status() {
    docker compose -f "$COMPOSE_FILE" ps
}

# Run database migrations
migrate() {
    check_prereqs
    load_env

    log_info "Running database migrations..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec api \
        node -e "
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);
migrate(db, { migrationsFolder: './apps/api/src/db/migrations' })
  .then(() => { console.log('Migrations complete'); pool.end(); })
  .catch(e => { console.error(e); pool.end(); process.exit(1); });
"
    log_info "Migrations complete"
}

# Dispatch command
case "${1:-deploy}" in
    deploy)     deploy ;;
    setup-ssl)  setup_ssl ;;
    renew-ssl)  renew_ssl ;;
    stop)       stop ;;
    logs)       shift; logs "$@" ;;
    status)     status ;;
    migrate)    migrate ;;
    *)
        echo "Usage: $0 {deploy|setup-ssl|renew-ssl|stop|logs|status|migrate}"
        exit 1
        ;;
esac
