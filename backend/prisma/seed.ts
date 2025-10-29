/**
 * Prisma seed script
 * Loads datasets from seed.json into the database
 */

import { PrismaClient } from '@prisma/client';
import { promises as fs } from 'fs';
import path from 'path';

const prisma = new PrismaClient();

interface DatasetFromSeed {
  id: string;
  creator: string;
  quality_score: number;
  price: string;
  listed: boolean;
  duration_seconds: number;
  languages: string[];
  formats: string[];
  media_type: string;
  created_at: number;
  title: string;
  description: string;
  total_purchases: number;
  preview_blob_id: string;
}

interface SeedData {
  datasets: DatasetFromSeed[];
}

async function main(): Promise<void> {
  console.log('🌱 Seeding database...\n');

  try {
    // Load seed data from frontend
    const seedPath = path.join(process.cwd(), '../frontend/data/seed.json');
    const seedContent = await fs.readFile(seedPath, 'utf-8');
    const seedData: SeedData = JSON.parse(seedContent);

    // Clear existing data
    await prisma.accessLog.deleteMany({});
    await prisma.purchase.deleteMany({});
    await prisma.datasetBlob.deleteMany({});
    await prisma.dataset.deleteMany({});
    console.log('✓ Cleared existing data');

    // Insert datasets
    let createdCount = 0;
    let blobCount = 0;

    for (const dataset of seedData.datasets) {
      // Create dataset
      await prisma.dataset.create({
        data: {
          id: dataset.id,
          creator: dataset.creator,
          quality_score: dataset.quality_score,
          price: BigInt(dataset.price),
          listed: dataset.listed,
          duration_seconds: dataset.duration_seconds,
          languages: dataset.languages,
          formats: dataset.formats,
          media_type: dataset.media_type,
          created_at: new Date(dataset.created_at),
          title: dataset.title,
          description: dataset.description,
          total_purchases: dataset.total_purchases,
        },
      });
      createdCount++;

      // Create blob mapping
      // Using placeholder blob_ids for development
      // In production, these would come from the actual Walrus storage
      await prisma.datasetBlob.create({
        data: {
          dataset_id: dataset.id,
          preview_blob_id: dataset.preview_blob_id || `preview-${dataset.id}`,
          full_blob_id: `full-${dataset.id}`,
        },
      });
      blobCount++;

      console.log(`✓ Created dataset: ${dataset.id} - ${dataset.title}`);
    }

    console.log(`\n✅ Seeding complete!`);
    console.log(`   - Datasets created: ${createdCount}`);
    console.log(`   - Blob mappings created: ${blobCount}`);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
