#!/bin/bash
# =============================================================================
# SONAR SEAL Key Server Setup Script
# =============================================================================
# This script helps set up the key server for local testing and deployment
# Run with: ./setup.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       🔐 SONAR SEAL Key Server Setup                     ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running from seal-keyserver directory
if [ ! -f "key-server-config.yaml.example" ]; then
    echo -e "${RED}❌ Error: Must run from seal-keyserver/ directory${NC}"
    echo -e "${YELLOW}   cd seal-keyserver && ./setup.sh${NC}"
    exit 1
fi

# Check prerequisites
echo -e "${BLUE}📋 Checking prerequisites...${NC}"

# Check if Rust is installed
if ! command -v cargo &> /dev/null; then
    echo -e "${RED}❌ Rust/Cargo not found${NC}"
    echo -e "${YELLOW}   Install from: https://rustup.rs${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Rust/Cargo found${NC}"

# Check if Sui CLI is installed
if ! command -v sui &> /dev/null; then
    echo -e "${YELLOW}⚠️  Sui CLI not found (needed for on-chain registration)${NC}"
    echo -e "${YELLOW}   Install from: https://sui.io/install${NC}"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 1: Clone SEAL Repository${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if SEAL repo exists
if [ -d "seal" ]; then
    echo -e "${YELLOW}⚠️  SEAL repository already exists${NC}"
    read -p "   Remove and re-clone? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}🗑️  Removing old SEAL repository...${NC}"
        rm -rf seal
    else
        echo -e "${GREEN}✅ Using existing SEAL repository${NC}"
    fi
fi

if [ ! -d "seal" ]; then
    echo -e "${BLUE}📥 Cloning SEAL repository...${NC}"
    git clone https://github.com/MystenLabs/seal.git
    echo -e "${GREEN}✅ SEAL repository cloned${NC}"
fi

cd seal

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 2: Build seal-cli${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${BLUE}🔨 Building seal-cli (this may take a few minutes)...${NC}"
cargo build --bin seal-cli --release

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to build seal-cli${NC}"
    exit 1
fi

echo -e "${GREEN}✅ seal-cli built successfully${NC}"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 3: Generate Master Seed${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${YELLOW}⚠️  IMPORTANT: Save this seed securely!${NC}"
echo -e "${YELLOW}   This is your root secret - anyone with this can derive all keys${NC}"
echo ""

echo -e "${GREEN}🎲 Generating master seed...${NC}"
echo ""

MASTER_SEED_OUTPUT=$(./target/release/seal-cli gen-seed)
MASTER_SEED=$(echo "$MASTER_SEED_OUTPUT" | grep -oE "0x[0-9a-fA-F]+")

if [ -z "$MASTER_SEED" ]; then
    echo -e "${RED}❌ Failed to parse master seed from seal-cli output${NC}"
    echo "$MASTER_SEED_OUTPUT"
    exit 1
fi

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Master Seed (SAVE THIS):${NC}"
echo -e "${GREEN}${MASTER_SEED}${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

cd ..

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 4: Create Local Environment File${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ -f ".env" ]; then
    echo -e "${YELLOW}⚠️  .env file already exists${NC}"
    read -p "   Overwrite? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}⚠️  Keeping existing .env${NC}"
    else
        echo -e "${BLUE}📝 Creating .env file...${NC}"
        cat > .env << EOF
# SEAL Key Server Environment Variables
# Generated by setup.sh on $(date)

# Master seed (generated above)
MASTER_KEY=${MASTER_SEED}

# Key server object ID (fill in after on-chain registration)
KEY_SERVER_OBJECT_ID=0xYOUR_OBJECT_ID_HERE

# Config file path
CONFIG_PATH=/app/config/key-server-config.yaml
EOF
        echo -e "${GREEN}✅ .env file created${NC}"
    fi
else
    echo -e "${BLUE}📝 Creating .env file...${NC}"
    cat > .env << EOF
# SEAL Key Server Environment Variables
# Generated by setup.sh on $(date)

# Master seed (generated above)
MASTER_KEY=${MASTER_SEED}

# Key server object ID (fill in after on-chain registration)
KEY_SERVER_OBJECT_ID=0xYOUR_OBJECT_ID_HERE

# Config file path
CONFIG_PATH=/app/config/key-server-config.yaml
EOF
    echo -e "${GREEN}✅ .env file created${NC}"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${YELLOW}📋 Next Steps:${NC}"
echo ""
echo -e "1. ${GREEN}Derive client key pair${NC}:"
echo -e "   ${BLUE}cd seal${NC}"
echo -e "   ${BLUE}./target/release/seal-cli derive-key --seed <MASTER_KEY> --index 0${NC}"
echo -e "   ${YELLOW}→ Save CLIENT_MASTER_KEY (secret) and PUBLIC_KEY (register on-chain)${NC}"
echo ""
echo -e "2. ${GREEN}Register on Sui${NC}:"
echo -e "   ${BLUE}# Choose the SEAL package ID for your network${NC}"
echo -e "   ${BLUE}#   • Mainnet: 0xa212c4c6c7183b911d0be8768f4cb1df7a383025b5d0ba0c014009f0f30f5f8d${NC}"
echo -e "   ${BLUE}#   • Testnet: 0x927a54e9ae803f82ebf480136a9bcff45101ccbe28b13f433c89f5181069d682${NC}"
echo -e "   ${BLUE}sui client call \\${NC}"
echo -e "   ${BLUE}  --package <SEAL_PACKAGE_ID> \\${NC}"
echo -e "   ${BLUE}  --module key_server \\${NC}"
echo -e "   ${BLUE}  --function create_and_transfer_v1 \\${NC}"
echo -e "   ${BLUE}  --args <SERVER_NAME> https://<SERVER_URL> 0 <PUBLIC_KEY> \\${NC}"
echo -e "   ${BLUE}  --gas-budget 100000000${NC}"
echo -e "   ${YELLOW}→ Record the KeyServer object ID from the transaction output${NC}"
echo ""
echo -e "3. ${GREEN}Update .env with object ID${NC}"
echo ""
echo -e "4. ${GREEN}Deploy to Railway:${NC}"
echo -e "   ${YELLOW}→ Set MASTER_KEY and KEY_SERVER_OBJECT_ID in Railway secrets${NC}"
echo -e "   ${YELLOW}→ Deploy from GitHub${NC}"
echo ""
echo -e "5. ${GREEN}Update SONAR frontend:${NC}"
echo -e "   ${BLUE}cd ../frontend${NC}"
echo -e "   ${BLUE}echo 'NEXT_PUBLIC_SEAL_KEY_SERVERS=https://your-url.railway.app' >> .env${NC}"
echo ""

echo -e "${BLUE}📚 Full instructions: See README.md${NC}"
echo ""
