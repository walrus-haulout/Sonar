#!/bin/bash
set -e

echo "Installing test dependencies..."
pip3 install -q pytest pytest-asyncio pytest-cov hypothesis fakeredis httpx pydantic redis 2>/dev/null || echo "Some dependencies failed, continuing..."

echo ""
echo "============================================================"
echo "Running test suite..."
echo "============================================================"
echo ""

export PYTHONPATH=/Users/angel/Projects/sonar/walrus-publisher/src:$PYTHONPATH

# Run tests with coverage
python3 -m pytest tests/ -v \
  --tb=short \
  --color=yes \
  2>&1 | head -500

echo ""
echo "Test suite complete!"
