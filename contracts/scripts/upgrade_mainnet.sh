#!/bin/bash
set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$SCRIPT_DIR/.."
MAINNET_JSON="$CONTRACTS_DIR/deployments/mainnet.json"
MOVE_TOML="$CONTRACTS_DIR/Move.toml"
BACKUP_TOML="$CONTRACTS_DIR/Move.toml.bak"

# Check if mainnet.json exists
if [ ! -f "$MAINNET_JSON" ]; then
    echo "Error: $MAINNET_JSON not found."
    exit 1
fi

# Extract Package ID and Upgrade Cap
PACKAGE_ID=$(grep -o '"packageId": "[^"]*"' "$MAINNET_JSON" | cut -d'"' -f4)
UPGRADE_CAP=$(grep -o '"upgradeCap": "[^"]*"' "$MAINNET_JSON" | cut -d'"' -f4)

if [ -z "$PACKAGE_ID" ] || [ -z "$UPGRADE_CAP" ]; then
    echo "Error: Could not extract packageId or upgradeCap from $MAINNET_JSON"
    exit 1
fi

echo "Found Package ID: $PACKAGE_ID"
echo "Found Upgrade Cap: $UPGRADE_CAP"

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

# Add published-at to Move.toml
# First remove any existing published-at line to avoid duplicates
sed -i.tmp '/published-at/d' "$MOVE_TOML" && rm "${MOVE_TOML}.tmp"
# Then add the new one after [package]
awk -v pkg="$PACKAGE_ID" '/\[package\]/ { print; print "published-at = \"" pkg "\""; next } 1' "$MOVE_TOML" > "${MOVE_TOML}.tmp" && mv "${MOVE_TOML}.tmp" "$MOVE_TOML"

echo "Added published-at = \"$PACKAGE_ID\" to Move.toml"

# Change to contracts directory for sui client upgrade
cd "$CONTRACTS_DIR"

# Remove Move.lock to avoid conflict with new published-at address
if [ -f "Move.lock" ]; then
    echo "Removing stale Move.lock..."
    rm "Move.lock"
fi

# Run Upgrade
echo "Running sui client upgrade..."
# Note: We use --skip-dependency-verification to avoid issues if dependencies have slight version mismatches,
# but ideally this should be removed if dependencies are clean.
# Gas budget: 0.5 SUI (500,000,000 MIST)
sui client upgrade --gas-budget 500000000 --upgrade-capability "$UPGRADE_CAP" --skip-dependency-verification

# Restore Move.toml
mv "$BACKUP_TOML" "$MOVE_TOML"
echo "Restored Move.toml"

echo "Upgrade command completed. Please check the output for the new Package ID and update deployments/mainnet.json."
