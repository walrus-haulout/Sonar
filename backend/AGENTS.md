# Backend Service Agent Guide

## Purpose
The Backend Service is the central API for the Sonar platform. It handles user authentication, data indexing, interaction with the database, and coordinates between the frontend and other services.

## Tech Stack
- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Fastify
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Containerization**: Docker

## Key Files
- `src/index.ts`: The entry point of the application, initializing the Fastify server and plugins.
- `prisma/schema.prisma`: Defines the database schema and relationships.
- `src/routes/`: Contains the API route definitions and handlers.
- `package.json`: Lists dependencies and scripts for building, testing, and database migrations.

## Workflows
- **API Development**: New endpoints are added in `src/routes` and registered in `src/index.ts`.
- **Database Changes**: Schema changes are made in `prisma/schema.prisma`, followed by `prisma migrate dev` to update the database.
- **Deployment**: The service is containerized using `Dockerfile` and deployed to a cloud provider (e.g., Railway, Fly.io).
