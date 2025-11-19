#!/bin/bash
set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$SCRIPT_DIR/.."
PUBLISH_OUTPUT="$CONTRACTS_DIR/publish-output.json"
INIT_OUTPUT="$CONTRACTS_DIR/init-output.json"

# Check if publish output exists
if [ ! -f "$PUBLISH_OUTPUT" ]; then
    echo "Error: $PUBLISH_OUTPUT not found. Run publish_mainnet.sh first."
    exit 1
fi

# Extract IDs using Node.js script
PARSED_IDS=$(node "$CONTRACTS_DIR/scripts/parse_publish_output.js")
PACKAGE_ID=$(echo "$PARSED_IDS" | grep -o '"packageId":"[^"]*"' | cut -d'"' -f4)
TREASURY_CAP_ID=$(echo "$PARSED_IDS" | grep -o '"treasuryCapId":"[^"]*"' | cut -d'"' -f4)

if [ -z "$PACKAGE_ID" ] || [ -z "$TREASURY_CAP_ID" ]; then
    echo "Error: Could not extract IDs"
    exit 1
fi

echo "Found Package ID: $PACKAGE_ID"
echo "Found Treasury Cap ID: $TREASURY_CAP_ID"

# Addresses (using the active address for both team and treasury for now)
ACTIVE_ADDRESS=$(sui client active-address)
TEAM_WALLET="$ACTIVE_ADDRESS"
TREASURY_ADDRESS="$ACTIVE_ADDRESS"

echo "Initializing Marketplace..."
echo "Team Wallet: $TEAM_WALLET"
echo "Treasury Address: $TREASURY_ADDRESS"

# Run Initialize
# initialize_marketplace(treasury_cap, team_wallet, treasury_address)
sui client call \
    --package "$PACKAGE_ID" \
    --module "marketplace" \
    --function "initialize_marketplace" \
    --args "$TREASURY_CAP_ID" "$TEAM_WALLET" "$TREASURY_ADDRESS" \
    --gas-budget 500000000 \
    --json > "$INIT_OUTPUT"

echo "Initialization completed. Output saved to $INIT_OUTPUT"
echo "Please parse the output to find the QualityMarketplace ID and update deployments/mainnet.json."
