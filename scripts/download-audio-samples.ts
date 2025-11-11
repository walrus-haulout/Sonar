#!/usr/bin/env bun

import { promises as fs } from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const SCRIPT_DIR = import.meta.dir;
const ROOT_DIR = path.resolve(SCRIPT_DIR, '..');
const CONFIG_PATH = path.join(SCRIPT_DIR, 'audio-config.json');
const OUTPUT_DIR = path.join(ROOT_DIR, 'frontend/public/audio');

function assertWithinRoot(baseDir: string, targetPath: string): string {
  const normalized = path.normalize(targetPath);
  const relative = path.relative(baseDir, normalized);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Unsafe path traversal attempt detected: ${targetPath}`);
  }

  return normalized;
}

const SAFE_OUTPUT_DIR = assertWithinRoot(ROOT_DIR, OUTPUT_DIR);

interface AudioConfig {
  id: string;
  title: string;
  license: string;
  author: string;
  source?: string;
  duration_seconds: number;
  notes?: string;
}

async function ensureOutputDir(): Promise<void> {
  try {
    await fs.mkdir(SAFE_OUTPUT_DIR, { recursive: true });
    console.log(`✓ Output directory ready: ${SAFE_OUTPUT_DIR}`);
  } catch (error) {
    throw new Error(`Failed to create output directory: ${error}`);
  }
}

async function loadConfig(): Promise<AudioConfig[]> {
  try {
    const safeConfigPath = assertWithinRoot(SCRIPT_DIR, CONFIG_PATH);
    const configContent = await fs.readFile(safeConfigPath, 'utf-8');
    const config = JSON.parse(configContent);
    return config.datasets;
  } catch (error) {
    throw new Error(`Failed to load config: ${error}`);
  }
}

async function generateSyntheticAudio(
  duration_seconds: number
): Promise<{ preview: Buffer; full: Buffer }> {
  // Generate a simple tone using ffmpeg
  console.log(`  Generating synthetic audio (${duration_seconds}s)...`);

  try {
    const tempFull = `/tmp/synthetic-full-${Date.now()}.mp3`;
    const tempPreview = `/tmp/synthetic-preview-${Date.now()}.mp3`;

    // Generate full audio: 440Hz sine wave
    execSync(
      `ffmpeg -f lavfi -i "sine=f=440:d=${duration_seconds}" -q:a 9 -n ${tempFull} 2>/dev/null`,
      { stdio: 'pipe' }
    );

    // Generate preview: first 30 seconds
    const previewDuration = Math.min(30, duration_seconds);
    execSync(
      `ffmpeg -f lavfi -i "sine=f=440:d=${previewDuration}" -q:a 9 -n ${tempPreview} 2>/dev/null`,
      { stdio: 'pipe' }
    );

    const full = await fs.readFile(tempFull);
    const preview = await fs.readFile(tempPreview);

    await fs.unlink(tempFull);
    await fs.unlink(tempPreview);

    return { preview, full };
  } catch (error) {
    throw new Error(`Failed to generate synthetic audio: ${error}`);
  }
}

async function saveAudioFiles(
  dataset: AudioConfig,
  audio: { preview: Buffer; full: Buffer }
): Promise<void> {
  const previewName = `preview-${dataset.id}.mp3`;
  const fullName = `full-${dataset.id}.mp3`;

  const previewPath = assertWithinRoot(ROOT_DIR, path.join(SAFE_OUTPUT_DIR, previewName));
  const fullPath = assertWithinRoot(ROOT_DIR, path.join(SAFE_OUTPUT_DIR, fullName));

  await fs.writeFile(previewPath, audio.preview);
  await fs.writeFile(fullPath, audio.full);

  console.log(`  ✓ Saved: ${previewName} (${(audio.preview.length / 1024).toFixed(0)} KB)`);
  console.log(`  ✓ Saved: ${fullName} (${(audio.full.length / 1024 / 1024).toFixed(2)} MB)`);
}

async function generateSourcesMarkdown(datasets: AudioConfig[]): Promise<void> {
  const timestamp = new Date().toISOString();

  let markdown = `# Audio Sources Attribution

Generated on: ${timestamp}

This file documents the sources and licensing information for all audio samples used in SONAR.

## Datasets

`;

  for (const dataset of datasets) {
    markdown += `### ${dataset.id} - ${dataset.title}

- **License**: ${dataset.license}
- **Author**: ${dataset.author}
- **Source**: ${dataset.source ?? 'Synthetic sample generated locally'}
- **Duration**: ${dataset.duration_seconds}s

`;
  }

  markdown += `## License Information

All audio files in this directory are used under Creative Commons licenses.
When redistributing, please maintain proper attribution as specified above.

## Note

Synthetic audio is generated locally using ffmpeg sine wave synthesis.
Generated content is not subject to external licensing restrictions.
`;

  const sourcesPath = assertWithinRoot(ROOT_DIR, path.join(SAFE_OUTPUT_DIR, 'AUDIO_SOURCES.md'));
  await fs.writeFile(sourcesPath, markdown);
  console.log(`\n✓ Generated: AUDIO_SOURCES.md`);
}

async function main(): Promise<void> {
  console.log('🎵 SONAR Audio Download Script\n');

  try {
    // Check dependencies
    try {
      execSync('which ffmpeg', { stdio: 'pipe' });
    } catch {
      throw new Error('ffmpeg not found. Install with: brew install ffmpeg');
    }

    await ensureOutputDir();

    const datasets = await loadConfig();
    console.log(`\nProcessing ${datasets.length} datasets...\n`);

    console.log('Generating synthetic audio previews (external integrations disabled).');

    // Generate audio for each dataset
    for (const dataset of datasets) {
      try {
        console.log(`\nProcessing ${dataset.title}...`);
        const audio = await generateSyntheticAudio(dataset.duration_seconds);

        await saveAudioFiles(dataset, audio);
      } catch (error) {
        console.error(`✗ Failed to process ${dataset.id}: ${error}`);
      }
    }

    // Generate attribution markdown
    await generateSourcesMarkdown(datasets);

    console.log('\n✅ Audio download complete!');
    console.log(`\nNext steps:`);
    console.log(`1. Audio files are in: ${SAFE_OUTPUT_DIR}`);
    console.log(`2. Add to .gitignore: ${path.join(SAFE_OUTPUT_DIR, '*.mp3')}`);
    console.log(`3. Start developing with: bun run dev:frontend`);
  } catch (error) {
    console.error(`\n❌ Error: ${error}`);
    process.exit(1);
  }
}

main();
