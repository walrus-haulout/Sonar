import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';

const migrationName = '20241001_initial_schema';

async function ensureBaselineApplied() {
  const prisma = new PrismaClient();

  try {
    const tableCheck = await prisma.$queryRaw<
      Array<{ exists: boolean }>
    >`SELECT to_regclass('_prisma_migrations') IS NOT NULL AS "exists"`;

    const migrationsTableExists = tableCheck[0]?.exists ?? false;

    if (!migrationsTableExists) {
      console.log(`[migrate] "_prisma_migrations" table missing; baseline ${migrationName} will apply automatically.`);
      return;
    }

    const applied = await prisma.$queryRaw<
      Array<{ exists: boolean }>
    >`
      SELECT EXISTS(
        SELECT 1
        FROM "_prisma_migrations"
        WHERE "migration_name" = ${migrationName}
          AND "finished_at" IS NOT NULL
      ) AS "exists"
    `;

    const alreadyApplied = applied[0]?.exists ?? false;

    if (alreadyApplied) {
      console.log(`[migrate] Baseline migration ${migrationName} already recorded. Skipping resolve.`);
      return;
    }

    console.log(`[migrate] Resolving baseline migration ${migrationName} as applied...`);
    execSync(`bunx prisma migrate resolve --applied ${migrationName}`, {
      stdio: 'inherit',
    });
  } catch (error) {
    console.error('[migrate] Failed to verify baseline migration state:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

ensureBaselineApplied()
  .then(() => {
    console.log('[migrate] Baseline migration check complete.');
  })
  .catch((error) => {
    console.error('[migrate] Baseline migration check failed:', error);
    process.exit(1);
  });

