#!/usr/bin/env bun

/**
 * Backend setup script
 * Generates JWT_SECRET and writes to .env
 * Usage: bun scripts/setup.ts
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

async function main(): Promise<void> {
  console.log('🔐 SONAR Backend Setup\n');

  const envPath = path.join(process.cwd(), '.env');

  try {
    // Generate secure JWT secret
    const jwtSecret = crypto.randomBytes(32).toString('hex');

    // Read existing .env or create empty
    let envContent = '';
    try {
      envContent = await fs.readFile(envPath, 'utf-8');
    } catch {
      // File doesn't exist, will create new
      envContent = '';
    }

    // Replace JWT_SECRET if exists, otherwise add it
    let newEnvContent: string;
    if (envContent.includes('JWT_SECRET=')) {
      newEnvContent = envContent.replace(/JWT_SECRET=.*/, `JWT_SECRET=${jwtSecret}`);
    } else {
      newEnvContent = envContent + (envContent.endsWith('\n') ? '' : '\n') + `JWT_SECRET=${jwtSecret}\n`;
    }

    // Write to .env
    await fs.writeFile(envPath, newEnvContent);

    console.log('✓ Generated secure JWT_SECRET');
    console.log(`✓ Written to: ${envPath}\n`);

    // Print instructions
    console.log('📝 Next steps:');
    console.log('1. Configure DATABASE_URL in .env');
    console.log('2. Run: bun run db:migrate');
    console.log('3. Run: bun run db:seed');
    console.log('4. Run: bun run dev\n');

    console.log('⚠️  IMPORTANT:');
    console.log('   - .env is in .gitignore - DO NOT commit it');
    console.log('   - Keep JWT_SECRET secure and unique per environment');
    console.log('   - Never share .env files in repositories\n');
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
}

main();
