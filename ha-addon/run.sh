#!/bin/bash
# Start Familjecentralen

echo "Starting Familjecentralen..."

cd /app
exec node server/index.js
