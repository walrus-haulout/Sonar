# Walrus Publisher Agent Guide

## Purpose
The Walrus Publisher is a high-performance service designed to publish data blobs to the Walrus storage protocol. It handles chunking, sub-wallet orchestration for sponsorship, and ensures reliable data availability.

## Tech Stack
- **Language**: Python 3.13+
- **Framework**: FastAPI
- **Package Manager**: uv
- **Concurrency**: Asyncio, uvloop
- **Storage**: Redis (for state/caching)

## Key Files
- `src/main.py`: The entry point for the FastAPI application.
- `pyproject.toml`: Configuration file for the project, including dependencies and build settings.
- `src/publisher/`: Contains the core logic for publishing blobs to Walrus.
- `Dockerfile`: Defines the container environment for the service.

## Workflows
- **Publishing**: The service receives data, chunks it if necessary, and publishes it to Walrus using a pool of sub-wallets.
- **Sponsorship**: It manages gas sponsorship for transactions to ensure seamless user experience.
- **Development**: Run `uv run src/main.py` (or similar) for local development.
