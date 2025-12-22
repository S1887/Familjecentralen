#!/usr/bin/with-contenv bashio
# ==============================================================================
# Start the Familjecentralen service
# ==============================================================================

bashio::log.info "Starting Familjecentralen..."

cd /app
exec npm run server
