# Frontend Agent Guide

## Purpose
The Frontend application serves as the user interface for the Sonar Marketplace. It allows users to browse, upload, and purchase audio data, interacting with both the backend API and the Sui blockchain.

## Tech Stack
- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Blockchain Interaction**: @mysten/dapp-kit, @mysten/sui.js
- **State Management**: React Query, React Context
- **Storage**: Walrus SDK

## Key Files
- `app/`: Contains the application routes and page components (Next.js App Router structure).
- `components/`: Reusable UI components.
- `hooks/`: Custom React hooks, including `useWalrusParallelUpload.ts` for handling file uploads to Walrus.
- `lib/`: Utility functions and shared logic.
- `package.json`: Dependencies and scripts.

## Workflows
- **Development**: Run `npm run dev` to start the local development server.
- **Building**: Run `npm run build` to create a production build.
- **Testing**: Run `npm test` to execute unit and integration tests.
- **Linting**: Run `npm run lint` to check for code quality issues.
