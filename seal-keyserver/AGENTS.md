# Seal Keyserver Agent Guide

## Purpose
The Seal Keyserver is a self-hosted service responsible for managing encryption keys and handling decryption requests for the Sonar platform. It uses the Microsoft SEAL library to provide secure, permissioned access to keys.

## Tech Stack
- **Language**: Rust
- **Build System**: Bazel, Nix
- **Containerization**: Docker
- **Key Management**: Microsoft SEAL

## Key Files
- `WORKSPACE`: The Bazel workspace configuration file.
- `flake.nix`: The Nix configuration for reproducible builds and dependencies.
- `Dockerfile`: Defines the production container image.
- `BUILD`: Bazel build targets for the keyserver binaries.
- `key-server-config.yaml.example`: Template for configuring the keyserver (e.g., permissions, network settings).

## Workflows
- **Build**: Run `bazel build //:binaries` to compile the keyserver and CLI tools.
- **Docker Build**: Run `docker build .` to create the production container image.
- **Deployment**: The container is deployed to a secure environment (e.g., Railway, AWS) and configured with a master key and on-chain object ID.
