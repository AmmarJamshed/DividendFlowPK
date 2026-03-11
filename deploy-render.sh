#!/bin/bash
# Render CLI deploy - run via WSL from project root:
#   wsl bash ./deploy-render.sh
# Requires: Render Blueprint already connected in dashboard, render login done

set -e
cd "$(dirname "$0")"

# Install Render CLI if not present
if ! command -v render &>/dev/null; then
    echo "Installing Render CLI..."
    curl -fsSL https://raw.githubusercontent.com/render-oss/cli/refs/heads/main/bin/install.sh | sh
    export PATH="$HOME/.render/bin:$PATH"
fi

echo "Validating render.yaml..."
render blueprints validate render.yaml -o text --confirm

echo ""
echo "Triggering deploys (use service name or ID from your workspace)..."
echo "Run: render deploys create dividendflow-backend --confirm"
echo "Run: render deploys create dividendflow-frontend --confirm"
echo ""
echo "Or run 'render services' to list and select interactively."
