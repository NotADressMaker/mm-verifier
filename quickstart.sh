#!/bin/bash

# MM Verifier Quickstart Demo
# One-command setup: spin up local environment and submit a demo verification

set -e

echo "┌──────────────────────────────────────────────────────────┐"
echo "│          MM Verifier - Quickstart Demo                  │"
echo "└──────────────────────────────────────────────────────────┘"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check prerequisites
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

echo -e "${YELLOW}[1/7]${NC} Checking prerequisites..."
if ! command_exists docker; then
    echo -e "${RED}❌ Docker not found. Please install Docker first.${NC}"
    exit 1
fi

if ! command_exists docker-compose; then
    echo -e "${RED}❌ docker-compose not found. Please install docker-compose first.${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Prerequisites met"
echo ""

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo -e "${YELLOW}[2/7]${NC} Creating .env file..."
    cat > .env << 'EOF'
# Database
DB_PASSWORD=dev_password_change_in_production

# LLM API Keys (add your own)
OPENAI_API_KEY=sk-your-key-here
ANTHROPIC_API_KEY=sk-ant-your-key-here
GOOGLE_API_KEY=your-key-here

# Local development (Hardhat default account)
VERIFIER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Will be set after deployment
MARKETPLACE_ADDRESS=
STAKING_ADDRESS=
EOF
    echo -e "${GREEN}✓${NC} .env file created (please add your API keys)"
    echo ""
else
    echo -e "${YELLOW}[2/7]${NC} .env file already exists"
    echo ""
fi

# Start infrastructure
echo -e "${YELLOW}[3/7]${NC} Starting infrastructure (Redis, Postgres, IPFS, Hardhat)..."
docker-compose up -d redis postgres ipfs hardhat
echo -e "${GREEN}✓${NC} Infrastructure started"
echo ""

# Wait for services to be healthy
echo -e "${YELLOW}[4/7]${NC} Waiting for services to be ready..."
echo -n "  Waiting for Redis..."
until docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; do
    echo -n "."
    sleep 1
done
echo -e " ${GREEN}✓${NC}"

echo -n "  Waiting for Postgres..."
until docker-compose exec -T postgres pg_isready -U verifier > /dev/null 2>&1; do
    echo -n "."
    sleep 1
done
echo -e " ${GREEN}✓${NC}"

echo -n "  Waiting for Hardhat..."
until curl -s -X POST http://localhost:8545 \
    -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    > /dev/null 2>&1; do
    echo -n "."
    sleep 1
done
echo -e " ${GREEN}✓${NC}"
echo ""

# Deploy contracts
echo -e "${YELLOW}[5/7]${NC} Deploying smart contracts..."
cd contracts
npm install --silent
npx hardhat compile --quiet
MARKETPLACE_ADDRESS=$(npx hardhat run scripts/deploy.ts --network localhost 2>&1 | grep "VerificationMarketplace:" | awk '{print $2}')
cd ..

if [ -z "$MARKETPLACE_ADDRESS" ]; then
    echo -e "${RED}❌ Contract deployment failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Contracts deployed"
echo -e "  Marketplace: ${GREEN}${MARKETPLACE_ADDRESS}${NC}"
echo ""

# Update .env with deployed addresses
sed -i "s|MARKETPLACE_ADDRESS=.*|MARKETPLACE_ADDRESS=${MARKETPLACE_ADDRESS}|" .env

# Start API and verifier node
echo -e "${YELLOW}[6/7]${NC} Starting API server and verifier node..."
docker-compose up -d api verifier-node
echo ""

# Wait for API to be ready
echo -n "  Waiting for API..."
until curl -s http://localhost:3000/health > /dev/null 2>&1; do
    echo -n "."
    sleep 1
done
echo -e " ${GREEN}✓${NC}"
echo ""

# Submit demo verification
echo -e "${YELLOW}[7/7]${NC} Submitting demo verification..."
DEMO_RESPONSE=$(curl -s -X POST http://localhost:3000/api/verify \
    -H "Content-Type: application/json" \
    -d '{
        "prompt": "What is the capital of France?",
        "models": ["gpt-4", "claude-3-opus"],
        "taskType": "factual-qa",
        "deadline": 3600
    }')

JOB_ID=$(echo $DEMO_RESPONSE | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)

if [ -z "$JOB_ID" ]; then
    echo -e "${RED}❌ Failed to submit verification${NC}"
    echo "Response: $DEMO_RESPONSE"
    exit 1
fi

echo -e "${GREEN}✓${NC} Demo verification submitted"
echo -e "  Job ID: ${GREEN}${JOB_ID}${NC}"
echo ""

# Success!
echo "┌──────────────────────────────────────────────────────────┐"
echo -e "│          ${GREEN}✓ MM Verifier is running!${NC}                    │"
echo "└──────────────────────────────────────────────────────────┘"
echo ""
echo "Services:"
echo -e "  • API:      ${GREEN}http://localhost:3000${NC}"
echo -e "  • IPFS:     ${GREEN}http://localhost:8080${NC}"
echo -e "  • Hardhat:  ${GREEN}http://localhost:8545${NC}"
echo ""
echo "Demo verification:"
echo -e "  • Job ID: ${YELLOW}${JOB_ID}${NC}"
echo -e "  • Status: ${GREEN}curl http://localhost:3000/api/verify/${JOB_ID}${NC}"
echo ""
echo "Useful commands:"
echo "  • View logs:    docker-compose logs -f"
echo "  • Stop all:     docker-compose down"
echo "  • Reset data:   docker-compose down -v"
echo ""
echo "Next steps:"
echo "  1. Add your LLM API keys to .env"
echo "  2. Check verification result: curl http://localhost:3000/api/verify/${JOB_ID}"
echo "  3. View documentation: open docs/README.md"
echo ""
