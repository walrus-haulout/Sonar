#!/bin/bash
# =============================================================================
# SONAR SEAL Key Server Local Runner
# =============================================================================
# This script retrieves the master key from macOS Keychain and runs the
# key server locally for testing and deriving the public key.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       🔐 SONAR SEAL Key Server (Local)                   ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running from seal-keyserver directory
if [ ! -f "key-server-config.yaml.example" ]; then
    echo -e "${RED}❌ Error: Must run from seal-keyserver/ directory${NC}"
    echo -e "${YELLOW}   cd seal-keyserver && ./run-keyserver.sh${NC}"
    exit 1
fi

# Check if seal directory exists
if [ ! -d "seal" ]; then
    echo -e "${RED}❌ Error: SEAL repository not found${NC}"
    echo -e "${YELLOW}   Run ./setup.sh first${NC}"
    exit 1
fi

echo -e "${BLUE}🔑 Retrieving master key from macOS Keychain...${NC}"

KEYCHAIN_ACCOUNT=${KEYCHAIN_ACCOUNT:-"$USER"}
KEYCHAIN_SERVICE=${KEYCHAIN_SERVICE:-"sonar-seal-master-key"}

# Retrieve master key from Keychain
MASTER_KEY=$(security find-generic-password -a "$KEYCHAIN_ACCOUNT" -s "$KEYCHAIN_SERVICE" -w 2>/dev/null)

if [ -z "$MASTER_KEY" ]; then
    echo -e "${RED}❌ Error: Master key not found in Keychain${NC}"
    echo -e "${YELLOW}   Run setup.sh to generate and store a master key${NC}"
    echo -e "${YELLOW}   (account: ${KEYCHAIN_ACCOUNT}, service: ${KEYCHAIN_SERVICE})${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Master key retrieved from Keychain${NC}"
echo ""

CLEAN_MASTER_KEY=$(echo -n "$MASTER_KEY" | tr -d "\n\r")
DERIVATION_INDEX=${DERIVATION_INDEX:-0}

if ! [[ "$DERIVATION_INDEX" =~ ^[0-9]+$ ]]; then
    echo -e "${RED}❌ Error: DERIVATION_INDEX must be a non-negative integer (got '$DERIVATION_INDEX')${NC}"
    exit 1
fi

echo -e "${BLUE}🧮 Deriving client key pair (index ${DERIVATION_INDEX})...${NC}"
echo ""
cd seal

if [ ! -f "target/release/seal-cli" ]; then
    echo -e "${BLUE}🔨 Building seal-cli (release)...${NC}"
    cargo build --bin seal-cli --release
    echo ""
fi

set +e
DERIVE_OUTPUT=$(./target/release/seal-cli derive-key --seed "$CLEAN_MASTER_KEY" --index "$DERIVATION_INDEX" 2>&1)
DERIVE_STATUS=$?
set -e

if [ $DERIVE_STATUS -ne 0 ]; then
    echo -e "${RED}❌ Failed to derive key material:${NC}"
    echo "$DERIVE_OUTPUT"
    exit 1
fi

CLIENT_MASTER_KEY=$(echo "$DERIVE_OUTPUT" | grep -oE "0x[0-9a-fA-F]+" | head -1 || true)
DERIVED_PUBLIC_KEY=$(echo "$DERIVE_OUTPUT" | grep -oE "0x[0-9a-fA-F]+" | tail -1 || true)

if [ -z "$CLIENT_MASTER_KEY" ] || [ -z "$DERIVED_PUBLIC_KEY" ]; then
    echo -e "${RED}❌ Unable to parse CLIENT_MASTER_KEY or PUBLIC_KEY from seal-cli output${NC}"
    echo "$DERIVE_OUTPUT"
    exit 1
fi

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}CLIENT_MASTER_KEY (store securely):${NC} ${CLIENT_MASTER_KEY}"
echo -e "${GREEN}PUBLIC_KEY (register on-chain):${NC} ${DERIVED_PUBLIC_KEY}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}📋 Next steps:${NC}"
echo -e "1. Register the public key with the SEAL package:"
echo -e "   ${BLUE}# Mainnet: 0xa212c4c6c7183b911d0be8768f4cb1df7a383025b5d0ba0c014009f0f30f5f8d${NC}"
echo -e "   ${BLUE}# Testnet: 0x927a54e9ae803f82ebf480136a9bcff45101ccbe28b13f433c89f5181069d682${NC}"
echo -e "   ${BLUE}sui client call \\${NC}"
echo -e "   ${BLUE}  --package <SEAL_PACKAGE_ID> \\${NC}"
echo -e "   ${BLUE}  --module key_server \\${NC}"
echo -e "   ${BLUE}  --function create_and_transfer_v1 \\${NC}"
echo -e "   ${BLUE}  --args <SERVER_NAME> https://<SERVER_URL> 0 ${DERIVED_PUBLIC_KEY} \\${NC}"
echo -e "   ${BLUE}  --gas-budget 100000000${NC}"
echo ""
echo -e "2. Update environment variables or Railway secrets with the new KEY_SERVER_OBJECT_ID."
