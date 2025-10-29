# SONAR Protocol Smart Contracts

## Prerequisites

### Required Sui CLI Version

**CRITICAL:** You must use Sui CLI v1.43.0 to build and test these contracts.

```bash
# Check your current version
sui --version

# If you see sui 1.57.2 or any version other than 1.43.0, install the matching version:
cargo install --locked --git https://github.com/MystenLabs/sui.git --tag testnet-v1.43.0 sui --force
```

**Why?** The Move.toml pins the Sui framework to `testnet-v1.43.0`. Using a mismatched CLI version (like 1.57.2) will cause all tests to fail with `UNEXPECTED_VERIFIER_ERROR (code 2017)` because the test runner expects a different `std::unit_test` module version.

## Building

```bash
# Use the v1.43.0 CLI
~/.cargo/bin/sui move build
```

Expected output:
```
BUILDING sonar
Total number of linter warnings suppressed: 2 (unique lints: 1)
```

## Testing

```bash
# Run all 31 tests
~/.cargo/bin/sui move test
```

Expected output:
```
Test result: OK. Total tests: 31; passed: 31; failed: 0
```

### Test Coverage

- **Economics Tests (15):** Tier boundaries, burn rates, reward calculations
- **Submission Tests (4):** Audio submission, finalization, vesting mechanics
- **Integration Tests (6):** Full marketplace flows, tier transitions
- **Admin Tests (6):** Circuit breaker, vault withdrawal, access control

## Project Structure

```
contracts/
├── sources/
│   ├── token.move           # SONAR token (57 lines)
│   ├── economics.move       # 4-tier dynamic economics (198 lines)
│   └── marketplace.move     # Main protocol (851 lines)
├── tests/
│   ├── submission_tests.move
│   ├── economics_tests.move
│   ├── integration_tests.move
│   └── admin_tests.move
└── Move.toml               # Framework: testnet-v1.43.0
```

## Documentation

- **[contracts.md](../docs/contracts.md)** - Complete technical specification
- **[WALRUS_INTEGRATION.md](../docs/WALRUS_INTEGRATION.md)** - Walrus/Seal integration guide
- **[CRITICAL_FIXES.md](../docs/CRITICAL_FIXES.md)** - Economic bug fix documentation
- **[DEPLOYMENT_READY.md](../docs/DEPLOYMENT_READY.md)** - Deployment readiness confirmation

## Deployment

See [DEPLOYMENT_READY.md](../docs/DEPLOYMENT_READY.md) for the complete deployment checklist.

## Troubleshooting

### Tests fail with UNEXPECTED_VERIFIER_ERROR (code 2017)

**Problem:** CLI version mismatch
```
ERROR move_vm_runtime::logging: [VM] Unexpected verifier/deserialization error!
Error: VMError { major_status: MISSING_DEPENDENCY, ... location: Module(..., name: "unit_test") }
```

**Solution:** Install Sui CLI v1.43.0 (see Prerequisites above)

### Build warnings about unknown lint filters

You may see:
```
warning[W10007]: Unknown warning filter 'lint(public_entry)'
```

This is expected and safe to ignore - the lint filter works correctly in v1.43.0 despite the warning message.
