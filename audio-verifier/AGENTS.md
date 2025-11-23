# Audio Verifier Agent Guide

## Purpose
The Audio Verifier service is responsible for fetching encrypted audio blobs from Walrus, decrypting them using the Seal SDK (with session key authentication), and verifying their content (e.g., checking for silence, format validity).

## Tech Stack
- **Language**: Python 3.10+
- **Containerization**: Docker
- **Decryption**: Seal SDK (via `seal_decryptor.py`)
- **Storage**: Walrus (via HTTP aggregator)
- **Concurrency**: `asyncio` for non-blocking operations

## Key Files
- `seal_decryptor.py`: Handles the core logic for fetching encrypted blobs from Walrus and decrypting them. It supports both direct and envelope encryption.
- `audio_checker.py`: Contains logic for verifying the integrity and content of the decrypted audio.
- `Dockerfile`: Defines the container environment, installing necessary system dependencies (like ffmpeg) and Python packages.
- `requirements.txt`: Lists Python dependencies.

## Workflows
- **Decryption**: The service receives a request with a blob ID and session key. It fetches the blob from Walrus and uses the Seal SDK to decrypt it.
- **Verification**: After decryption, the audio is analyzed to ensure it meets quality standards (e.g., not empty, valid format).
- **Deployment**: Built as a Docker container and deployed to the backend infrastructure.
