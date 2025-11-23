#!/bin/bash
# Test if Walrus upload edge function is working

echo "Testing Walrus upload edge function..."
echo "========================================"

# Create a small test file
echo "Creating test file..."
echo "test-$(date +%s)" > /tmp/test-walrus.bin

# Test the edge function
echo "Uploading to edge function..."
curl -v "https://www.projectsonar.xyz/api/edge/walrus/upload" \
  -X POST \
  -F "file=@/tmp/test-walrus.bin" \
  -F "seal_policy_id=test123" \
  -F "epochs=1" \
  2>&1 | tee /tmp/walrus-test-response.log

echo ""
echo "========================================"
echo "Response saved to /tmp/walrus-test-response.log"
