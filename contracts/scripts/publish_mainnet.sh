#!/bin/bash
set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$SCRIPT_DIR/.."
MOVE_TOML="$CONTRACTS_DIR/Move.toml"
BACKUP_TOML="$CONTRACTS_DIR/Move.toml.bak"
OUTPUT_FILE="$CONTRACTS_DIR/publish-output.json"

# Backup Move.toml
cp "$MOVE_TOML" "$BACKUP_TOML"
echo "Backed up Move.toml to $BACKUP_TOML"

# Cleanup function
cleanup() {
    if [ -f "$BACKUP_TOML" ]; then
        mv "$BACKUP_TOML" "$MOVE_TOML"
        echo "Restored Move.toml from backup"
    fi
}
trap cleanup EXIT

# Remove published-at from Move.toml to ensure fresh deployment
sed -i.tmp '/published-at/d' "$MOVE_TOML" && rm "${MOVE_TOML}.tmp"
echo "Removed published-at from Move.toml for fresh deployment"

# Change to contracts directory
cd "$CONTRACTS_DIR"

# Remove Move.lock to avoid conflicts
if [ -f "Move.lock" ]; then
    echo "Removing stale Move.lock..."
    rm "Move.lock"
fi

# Run Publish
echo "Running sui client publish..."
# Gas budget: 2 SUI (2,000,000,000 MIST) - higher budget for full publish
sui client publish --gas-budget 2000000000 --json > "$OUTPUT_FILE"

echo "Publish command completed. Output saved to $OUTPUT_FILE"
echo "Please parse the output to update deployments/mainnet.json."
