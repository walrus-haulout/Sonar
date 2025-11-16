# SONAR Protocol Smart Contracts

## Prerequisites

### Required Sui CLI Version

**CRITICAL:** You must use Sui CLI v1.60.1 to build and test these contracts.

```bash
# Check your current version
sui --version

# If you see sui 1.57.2 or any version other than 1.60.1, install the matching version:
cargo install --locked --git https://github.com/MystenLabs/sui.git --tag mainnet-v1.60.1 sui --force
```

**Why?** The Move.toml pins the Sui framework to commit `bd272b07244d` (`mainnet-v1.60.1`). Using a mismatched CLI version (like 1.57.2) will cause all tests to fail with `UNEXPECTED_VERIFIER_ERROR (code 2017)` because the test runner expects a different `std::unit_test` module version.

## Building

```bash
# Use the v1.60.1 CLI
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
│   ├── economics.move       # 60/40 creator/protocol split (198 lines)
│   └── marketplace.move     # Main protocol (960+ lines)
├── tests/
│   ├── submission_tests.move
│   ├── economics_tests.move
│   ├── integration_tests.move
│   └── admin_tests.move
└── Move.toml               # Framework: mainnet-v1.60.1 (rev bd272b07244d)
```

## Key Features

### Payment Support
- **SUI Payments**: Temporary support for SUI-based purchases (can be disabled via `toggle_sui_payments`)
- **SNR Payments**: Native SNR token payments with full economic split
- **Revenue Split**: Fixed 60% to creator, 40% to protocol (both payment methods)

### AI Price Suggestions
- **Auto-Pricing**: When validators finalize submissions, AI automatically sets initial price based on quality score
- **Quality Tiers**:
  - <50: Base price (reward amount)
  - 50-70: 2x base price
  - 70-90: 5x base price
  - 90+: 10x base price
- **Updatable**: Creators can adjust prices anytime via `update_price()`

### Economics
- **Simplified Model**: Fixed 60% uploader / 40% protocol split across all tiers
- **No Complex Burns**: Removed tier-based burn rates for clarity
- **Transparent Treasury**: All protocol revenue goes to treasury address

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

**Solution:** Install Sui CLI v1.60.1 (see Prerequisites above)

### Build warnings about unknown lint filters

You may see:
```
warning[W10007]: Unknown warning filter 'lint(public_entry)'
```

This is expected and safe to ignore - the lint filter works correctly in v1.60.1 despite the warning message.
