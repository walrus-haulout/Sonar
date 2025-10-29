#!/usr/bin/env bun

/**
 * Download audio samples from FreeSound.org or generate synthetic audio
 * Usage: bun scripts/download-audio-samples.ts
 */

import { promises as fs } from 'fs';
import path from 'path';
import { execSync } from 'child_process';

interface AudioConfig {
  id: string;
  title: string;
  freesound_id: number;
  freesound_search: string;
  license: string;
  author: string;
  duration_seconds: number;
}

const CONFIG_PATH = './scripts/audio-config.json';
const OUTPUT_DIR = './frontend/public/audio';
const FREESOUND_API_KEY = process.env.FREESOUND_API_KEY;

async function ensureOutputDir(): Promise<void> {
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    console.log(`✓ Output directory ready: ${OUTPUT_DIR}`);
  } catch (error) {
    throw new Error(`Failed to create output directory: ${error}`);
  }
}

async function loadConfig(): Promise<AudioConfig[]> {
  try {
    const configContent = await fs.readFile(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(configContent);
    return config.datasets;
  } catch (error) {
    throw new Error(`Failed to load config: ${error}`);
  }
}

async function downloadFromFreeSound(
  dataset: AudioConfig
): Promise<{ preview: Buffer; full: Buffer }> {
  if (!FREESOUND_API_KEY) {
    throw new Error('FREESOUND_API_KEY not set. Cannot download from FreeSound.');
  }

  console.log(`\nDownloading ${dataset.title}...`);

  try {
    // Download the audio file
    const response = await fetch(
      `https://freesound.org/apiv2/sounds/${dataset.freesound_id}/download/`,
      {
        headers: {
          Authorization: `Token ${FREESOUND_API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`FreeSound API error: ${response.statusText}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const full = Buffer.from(audioBuffer);

    console.log(`  Downloaded ${(full.length / 1024 / 1024).toFixed(2)} MB`);

    // Generate 30s preview using ffmpeg
    const tempInput = `/tmp/${dataset.id}-full.mp3`;
    const tempPreview = `/tmp/${dataset.id}-preview.mp3`;

    await fs.writeFile(tempInput, full);

    // Extract first 30 seconds
    execSync(
      `ffmpeg -i ${tempInput} -t 30 -q:a 9 -n ${tempPreview} 2>/dev/null`,
      { stdio: 'pipe' }
    );

    const preview = await fs.readFile(tempPreview);

    // Cleanup temp files
    await fs.unlink(tempInput);
    await fs.unlink(tempPreview);

    return { preview, full };
  } catch (error) {
    throw new Error(`Failed to download from FreeSound: ${error}`);
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

  const previewPath = path.join(OUTPUT_DIR, previewName);
  const fullPath = path.join(OUTPUT_DIR, fullName);

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
- **Source**: [${dataset.freesound_search}](${dataset.url})
- **Duration**: ${dataset.duration_seconds}s

`;
  }

  markdown += `## License Information

All audio files in this directory are used under Creative Commons licenses.
When redistributing, please maintain proper attribution as specified above.

## Note

If audio was generated synthetically (due to missing FreeSound API key),
generated content is not subject to external licensing restrictions.
`;

  const sourcesPath = path.join(OUTPUT_DIR, 'AUDIO_SOURCES.md');
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

    const useFreeSound = !!FREESOUND_API_KEY;
    console.log(
      useFreeSound
        ? 'Using FreeSound API for downloads'
        : 'Generating synthetic audio (FREESOUND_API_KEY not set)'
    );

    // Download or generate audio for each dataset
    for (const dataset of datasets) {
      try {
        let audio;

        if (useFreeSound) {
          audio = await downloadFromFreeSound(dataset);
        } else {
          console.log(`\nProcessing ${dataset.title}...`);
          audio = await generateSyntheticAudio(dataset.duration_seconds);
        }

        await saveAudioFiles(dataset, audio);
      } catch (error) {
        console.error(`✗ Failed to process ${dataset.id}: ${error}`);
        if (useFreeSound) {
          console.log('  Falling back to synthetic audio...');
          const audio = await generateSyntheticAudio(dataset.duration_seconds);
          await saveAudioFiles(dataset, audio);
        }
      }
    }

    // Generate attribution markdown
    await generateSourcesMarkdown(datasets);

    console.log('\n✅ Audio download complete!');
    console.log(`\nNext steps:`);
    console.log(`1. Audio files are in: ${OUTPUT_DIR}`);
    console.log(`2. Add to .gitignore: ${OUTPUT_DIR}/*.mp3`);
    console.log(`3. Start developing with: bun run dev:frontend`);
  } catch (error) {
    console.error(`\n❌ Error: ${error}`);
    process.exit(1);
  }
}

main();
