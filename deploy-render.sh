#!/bin/bash
# Render CLI deploy - run via WSL: wsl -e bash deploy-render.sh
# Requires: Render CLI installed, render login completed

set -e
cd "$(dirname "$0")"

# Install Render CLI if not present
if ! command -v render &>/dev/null; then
    echo "Installing Render CLI..."
    curl -fsSL https://raw.githubusercontent.com/render-oss/cli/refs/heads/main/bin/install.sh | sh
    export PATH="$HOME/.render/bin:$PATH"
fi

# Validate blueprint
echo "Validating render.yaml..."
render blueprints validate render.yaml

# Login if needed
render login 2>/dev/null || true

# List services and trigger deploys
echo ""
echo "Services in workspace:"
render services -o text --confirm 2>/dev/null || render services

echo ""
echo "To trigger a deploy, run:"
echo "  render deploys create dividendflow-backend --confirm"
echo "  render deploys create dividendflow-frontend --confirm"
echo ""
echo "Or use the service ID from the list above."
