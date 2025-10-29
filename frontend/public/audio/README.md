# Mock Audio Files

This directory contains mock audio files for development and testing of the Wavesurfer.js integration.

## Current Implementation

The application expects audio files in the following format:

### Preview Files (DatasetCard hover-to-play)
- **Pattern**: `preview-{dataset.id}.mp3`
- **Duration**: ~30 seconds (preview length)
- **Used by**: DatasetCard component in marketplace grid
- **Purpose**: Quick preview on hover with 150ms delay

### Full Files (AudioPlayer detail page)
- **Pattern**: `full-{dataset.id}.mp3`
- **Duration**: Full audio duration
- **Used by**: AudioPlayer component on dataset detail pages
- **Purpose**: Full playback with controls and seeking

## Adding Test Files

To test the waveform visualization and playback:

1. Add MP3 files to this directory following the naming pattern above
2. The dataset IDs are generated from the repository
3. Example files:
   - `preview-dataset-123.mp3`
   - `full-dataset-123.mp3`

## File Requirements

- **Format**: MP3 (AAC codec)
- **Sample Rate**: 44.1kHz recommended
- **Bit Depth**: 16-bit
- **Channels**: Mono or Stereo

## Future Integration with Walrus Storage

In production, these mock URLs will be replaced with:

### Preview Audio
- Fetched from Walrus using `dataset.preview_blob_id`
- Publicly accessible without purchase
- Limited to 30-second preview

### Full Audio
- Fetched from Walrus using `dataset.blob_id`
- Requires dataset purchase for access
- Decrypted using Mysten Seal after purchase validation

## Fallback Behavior

If audio files are not found:
- **DatasetCard**: Shows seeded pseudo-random bars (SSR-safe)
- **AudioPlayer**: Shows loading placeholder with animated pulse
- No errors are thrown - graceful degradation

## Testing Waveform Generation

To see real waveform peaks:
1. Add at least one test audio file
2. Name it to match a dataset ID in your test data
3. Hover over the card (marketplace) or visit detail page
4. Wavesurfer will extract peaks and render the waveform

## Cache Management

Extracted peaks are cached by source URL and slice count to improve performance:
- Cache key: `${src}-${sliceCount}`
- Automatically evicted on component unmount
- Prevents redundant peak extraction on re-renders

## Debugging

To monitor cache size:
```javascript
import { getPeakCacheSize } from '@/lib/waveform-utils';
console.log('Peak cache size:', getPeakCacheSize());
```
