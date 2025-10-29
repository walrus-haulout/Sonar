/**
 * Prisma database client
 */

import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

// Handle disconnection on app shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
});
