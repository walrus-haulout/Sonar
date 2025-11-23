# Smart Contracts Agent Guide

## Purpose
The Smart Contracts component manages the on-chain logic for the Sonar Protocol on the Sui blockchain. It handles access control, data integrity verification, and interactions with the Walrus storage protocol.

## Tech Stack
- **Language**: Sui Move
- **Framework**: Sui Framework
- **Dependencies**: Walrus, WAL

## Key Files
- `Move.toml`: The manifest file defining the package metadata, dependencies, and addresses.
- `sources/`: Directory containing the Move source modules (`.move` files).
- `Move.lock`: Lock file for dependencies to ensure reproducible builds.

## Workflows
- **Development**: Contracts are written in the `sources/` directory.
- **Testing**: Unit tests are written within the modules or in separate test files and run using `sui move test`.
- **Deployment**: Contracts are published to the Sui network (Testnet/Mainnet) using `sui client publish`.
- **Upgrades**: Contract upgrades are managed via `sui client upgrade`, following Sui's package upgrade rules.
