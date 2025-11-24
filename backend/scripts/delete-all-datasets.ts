#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteAllDatasets() {
  try {
    console.log('🗑️  Starting deletion of all marketplace datasets...\n');

    // Count datasets before deletion
    const totalDatasets = await prisma.dataset.count();
    const totalBlobs = await prisma.datasetBlob.count();
    const totalPurchases = await prisma.purchase.count();
    const totalAccessLogs = await prisma.accessLog.count();

    console.log(`📊 Current counts:`);
    console.log(`   - Datasets: ${totalDatasets}`);
    console.log(`   - Dataset Blobs: ${totalBlobs}`);
    console.log(`   - Purchases: ${totalPurchases}`);
    console.log(`   - Access Logs: ${totalAccessLogs}\n`);

    if (totalDatasets === 0) {
      console.log('✅ No datasets found. Database is already clean.');
      return;
    }

    // Delete all datasets (cascade will handle related records)
    console.log('🗑️  Deleting all datasets and related records...');
    const result = await prisma.dataset.deleteMany({});

    console.log(`\n✅ Successfully deleted ${result.count} datasets`);
    console.log('   Related DatasetBlobs, Purchases, and AccessLogs were automatically deleted via cascade.');

    // Verify deletion
    const remainingDatasets = await prisma.dataset.count();
    const remainingBlobs = await prisma.datasetBlob.count();
    const remainingPurchases = await prisma.purchase.count();
    const remainingAccessLogs = await prisma.accessLog.count();

    console.log(`\n📊 Remaining counts:`);
    console.log(`   - Datasets: ${remainingDatasets}`);
    console.log(`   - Dataset Blobs: ${remainingBlobs}`);
    console.log(`   - Purchases: ${remainingPurchases}`);
    console.log(`   - Access Logs: ${remainingAccessLogs}`);

    if (remainingDatasets === 0 && remainingBlobs === 0 && remainingPurchases === 0 && remainingAccessLogs === 0) {
      console.log('\n✨ All marketplace data successfully removed!');
    } else {
      console.log('\n⚠️  Warning: Some records still remain.');
    }

  } catch (error) {
    console.error('❌ Error deleting datasets:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

deleteAllDatasets()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
