#!/bin/bash
# scripts/after-cowork.sh
# Run this after each Cowork session
cd ~/Desktop/Claude/SpaceGuard/spaceguard
npm install
npx drizzle-kit push 2>/dev/null
git push origin main
echo "Done. Check GitHub."