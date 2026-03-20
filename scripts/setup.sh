#!/bin/bash
set -e
echo "=== SpaceGuard Dev Setup ==="

echo "Starting PostgreSQL (TimescaleDB) and Redis..."
docker compose up -d
sleep 5

if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env from template"
fi

echo "Installing npm dependencies (all workspaces)..."
npm install

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Run these in separate terminals:"
echo "  API:  npm run dev -w apps/api      ->  http://localhost:3001"
echo "  Web:  npm run dev -w apps/web      ->  http://localhost:3000"
echo ""
echo "Or run both with: npm run dev"
echo ""
echo "Verify DB: psql postgresql://spaceguard:spaceguard_dev@localhost:5432/spaceguard"
