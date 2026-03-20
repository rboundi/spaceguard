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

echo "Installing npm dependencies..."
npm install

if [ ! -f apps/web/package.json ]; then
    echo "Initializing Next.js frontend..."
    cd apps/web
    npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --use-npm --no-git
    npm pkg set dependencies.@spaceguard/shared="*"
    cd ../..
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "  Full stack:  npm run dev"
echo "  API only:    npm run dev -w apps/api"
echo "  Web only:    npm run dev -w apps/web"
echo ""
echo "  API:     http://localhost:3001"
echo "  Web:     http://localhost:3000"
