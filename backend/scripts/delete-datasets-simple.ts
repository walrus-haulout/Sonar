#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.dataset.deleteMany({});
  console.log(`Deleted ${result.count} datasets`);
  await prisma.$disconnect();
}

main().catch(console.error);
