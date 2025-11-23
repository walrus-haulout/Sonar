# Packages Agent Guide

## Purpose
The `packages` directory contains shared libraries and utilities used across the Sonar monorepo. This facilitates code reuse and modularity between the frontend, backend, and other services.

## Tech Stack
- **Language**: TypeScript
- **Manager**: pnpm workspaces

## Key Files
- `seal/`: Contains the shared Seal SDK logic for encryption and decryption.
- `shared/`: Contains common types, constants, and utility functions used by multiple packages.
- `package.json`: Defines the workspace configuration and dependencies for the shared packages.

## Workflows
- **Development**: Changes are made in the respective package directories (`seal`, `shared`).
- **Build**: Packages are built as part of the monorepo build process or individually.
- **Usage**: Other services (e.g., frontend, backend) import these packages as dependencies.
