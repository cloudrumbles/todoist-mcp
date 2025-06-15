#!/bin/bash

echo "🚀 Deploying Todoist MCP Server to Railway..."

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Please install it first:"
    echo "   npm install -g @railway/cli"
    exit 1
fi

# Build the project
echo "📦 Building project..."
npm run build

# Deploy to Railway
echo "🚀 Deploying to Railway..."
railway up

echo "✅ Deployment complete!"
echo "📋 Remember to set your TODOIST_API_KEY environment variable in the Railway dashboard"
echo "🌐 Your server will be available at your Railway app URL"
