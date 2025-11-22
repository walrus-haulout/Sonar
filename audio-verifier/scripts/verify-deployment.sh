#!/bin/bash
#
# Deployment Health Check Verification Script
# Validates Seal service connectivity and configuration after deployment
#
# Usage:
#   ./scripts/verify-deployment.sh
#   SEAL_SERVICE_URL=http://seal-1.railway.app ./scripts/verify-deployment.sh
#   VERIFIER_AUTH_TOKEN=mytoken SEAL_SERVICE_URL=... ./scripts/verify-deployment.sh
#

set -e

# Configuration
SEAL_SERVICE_URL="${SEAL_SERVICE_URL:-http://127.0.0.1:3001}"
VERIFIER_SERVICE_URL="${VERIFIER_SERVICE_URL:-http://127.0.0.1:8000}"
HEALTH_TIMEOUT=10
CONNECTIVITY_TIMEOUT=5

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_header() {
    echo -e "\n${GREEN}=== $1 ===${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Test Seal service health endpoint
test_seal_health() {
    print_header "Testing Seal Service Health"

    echo "Seal Service URL: $SEAL_SERVICE_URL"

    if ! command -v curl &> /dev/null; then
        print_warning "curl not found, skipping health check"
        return 0
    fi

    response=$(curl -s -w "\n%{http_code}" -m $HEALTH_TIMEOUT "$SEAL_SERVICE_URL/health" 2>&1 || echo "000")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)

    if [ "$http_code" = "200" ]; then
        print_success "Seal service is healthy (HTTP 200)"
        echo "  Response: $body"
        return 0
    else
        print_error "Seal service health check failed (HTTP $http_code)"
        echo "  Response: $body"
        return 1
    fi
}

# Test Seal service connectivity
test_seal_connectivity() {
    print_header "Testing Seal Service Connectivity"

    if ! command -v curl &> /dev/null; then
        print_warning "curl not found, skipping connectivity check"
        return 0
    fi

    # Try to reach the service with a simple connection test
    if curl -s -m $CONNECTIVITY_TIMEOUT "$SEAL_SERVICE_URL/health" > /dev/null 2>&1; then
        print_success "Seal service is reachable at $SEAL_SERVICE_URL"
        return 0
    else
        print_error "Cannot reach Seal service at $SEAL_SERVICE_URL"
        return 1
    fi
}

# Validate SEAL_KEY_SERVER_URLS configuration
test_seal_key_server_urls() {
    print_header "Validating SEAL_KEY_SERVER_URLS Configuration"

    seal_key_server_urls="${SEAL_KEY_SERVER_URLS:-{}}"
    echo "SEAL_KEY_SERVER_URLS: $seal_key_server_urls"

    # Try to parse as JSON
    if ! command -v python3 &> /dev/null; then
        print_warning "python3 not found, skipping JSON validation"
        return 0
    fi

    if python3 -c "import json; json.loads('$seal_key_server_urls')" 2>/dev/null; then
        print_success "SEAL_KEY_SERVER_URLS is valid JSON"

        # Count configured servers
        count=$(python3 -c "import json; data = json.loads('$seal_key_server_urls'); print(len(data))")

        if [ "$count" -eq 0 ]; then
            print_warning "SEAL_KEY_SERVER_URLS is empty - Seal SDK will attempt default server discovery"
        else
            print_success "Configured $count key server(s)"
        fi
        return 0
    else
        print_error "SEAL_KEY_SERVER_URLS is not valid JSON"
        return 1
    fi
}

# Check if required environment variables are set
test_environment() {
    print_header "Checking Environment Variables"

    # Check for critical variables
    missing=()

    if [ -z "$SEAL_PACKAGE_ID" ]; then
        missing+=("SEAL_PACKAGE_ID")
    else
        print_success "SEAL_PACKAGE_ID is set"
    fi

    if [ -z "$WALRUS_AGGREGATOR_URL" ]; then
        missing+=("WALRUS_AGGREGATOR_URL")
    else
        print_success "WALRUS_AGGREGATOR_URL is set"
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        for var in "${missing[@]}"; do
            print_error "Missing $var"
        done
        return 1
    fi

    return 0
}

# Check if services are running (optional)
test_service_ports() {
    print_header "Checking Service Ports"

    if ! command -v netstat &> /dev/null && ! command -v ss &> /dev/null; then
        print_warning "netstat/ss not found, skipping port check"
        return 0
    fi

    # Try to extract port from Seal service URL
    if [[ $SEAL_SERVICE_URL =~ :([0-9]+) ]]; then
        port="${BASH_REMATCH[1]}"
        echo "Checking if Seal service port $port is open..."

        if command -v ss &> /dev/null; then
            if ss -tlnp 2>/dev/null | grep -q ":$port " 2>/dev/null; then
                print_success "Seal service port $port is listening"
                return 0
            fi
        elif command -v netstat &> /dev/null; then
            if netstat -tlnp 2>/dev/null | grep -q ":$port " 2>/dev/null; then
                print_success "Seal service port $port is listening"
                return 0
            fi
        fi

        print_warning "Could not verify port $port is listening"
    fi

    return 0
}

# Main execution
main() {
    echo "Starting deployment verification..."

    failed=0

    # Run all tests
    test_environment || ((failed++))
    test_seal_key_server_urls || ((failed++))
    test_seal_connectivity || ((failed++))
    test_seal_health || ((failed++))
    test_service_ports || ((failed++))

    # Summary
    print_header "Verification Summary"

    if [ $failed -eq 0 ]; then
        print_success "All checks passed!"
        echo ""
        echo "Deployment is ready for verification testing."
        exit 0
    else
        print_error "$failed check(s) failed"
        echo ""
        echo "Please review the errors above and fix any issues before testing."
        exit 1
    fi
}

main "$@"
