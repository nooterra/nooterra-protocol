#!/bin/bash
# deploy-standard.sh
# Uses service UI root settings; uploads full repo and lets Railway find the configured root.

set -euo pipefail

cd "$(dirname "$0")" || exit 1

echo "🚀 Starting Standardized Deployment (Respecting UI Settings)..."

echo "📦 Deploying Registry..."
railway up --service nooterra-registry --detach

echo "📦 Deploying Coordinator..."
railway up --service nooterra-coordinator --detach

echo "📦 Deploying Dispatcher..."
railway up --service nooterra-dispatcher --detach

echo "📦 Deploying Agents..."
railway up --service agent-customs --detach
railway up --service agent-weather --detach
railway up --service agent-rail --detach
railway up --service agent-echo --detach

echo "🎉 All services deployed! They will use the UI-configured roots."
