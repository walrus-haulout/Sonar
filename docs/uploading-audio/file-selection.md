# Step 1: File Selection

The first step of uploading is selecting your audio files. This page explains what files are accepted and what to know before uploading.

## Supported Audio Formats

SONAR accepts the following audio formats:

**MP3** (.mp3): Widely supported, good compression
**WAV** (.wav): Uncompressed, high quality
**M4A** (.m4a): Apple standard, good compression with quality
**OGG** (.ogg): Open-source format, quality comparable to MP3
**FLAC** (.flac): Lossless compression, highest quality

## File Size Limits

Each audio file can be up to 500 MB. This covers:
- Most single recordings up to several hours
- Multiple shorter files combined in one file

If you have larger files, consider:
- Splitting into multiple uploads
- Compressing to MP3 format (reduces file size by 75-90%)
- Uploading shorter segments separately

## Duration Requirements

- **Minimum**: 1 second
- **Maximum**: 1 hour per file
- **Recommended**: 10 seconds to 30 minutes

Shorter audio (1-10 seconds) is accepted but earns lower scores. Longer audio (1+ hour) is accepted but verification takes longer.

## Technical Quality Standards

SONAR accepts audio with various technical specifications:

**Sample Rate**: Minimum 8 kHz
- 8 kHz (telephony, speech): Acceptable
- 16 kHz (voice calls): Good
- 44.1 kHz (CD quality): Excellent
- 48 kHz (professional): Excellent
- 96 kHz+ (high-resolution): Excellent

Higher sample rates earn quality multiplier bonuses.

**Bit Depth**: Typically 8, 16, 24, or 32 bits per sample
- Higher bit depth = higher quality
- 16-bit is standard (CD quality)
- 24-bit is professional quality

**Channels**: Mono, stereo, or multi-channel
- Mono: 1 channel
- Stereo: 2 channels
- Surround: 5.1, 7.1, etc.

More channels can indicate higher production value.

**Volume Levels**: Optimal range is -40dB to -6dB
- Too quiet (below -40dB): May be rejected
- Too loud (above -6dB): Clipping detected, may be rejected
- Ideal: Peak levels around -12dB to -3dB

During verification, volume levels are checked. Extremely quiet or clipped audio is rejected.

## What Gets Rejected

The following audio will not pass verification:

**Too Short**: Less than 1 second duration

**Too Quiet**: Average volume too low for analysis

**Excessive Clipping**: Distorted by being recorded too loud

**Excessive Silence**: More than 30% silence

**Copyrighted Material**: Detected fingerprint matches known copyrighted works

**Safety Violations**:
- Hate speech or slurs
- Graphic violence
- Explicit gore
- Doxxing or personal information

**Unintelligible**: Completely unclear what is being recorded

## How to Select Files

1. Navigate to the upload page
2. Click "Select Files" or drag and drop files
3. You can select multiple files at once
4. Review the list of selected files
5. See estimated duration and file size
6. Remove any files you do not want to upload

## Can I Upload Multiple Files Together?

Yes. You can select multiple files and upload them as a single dataset. This is useful for:

**Bulk Submissions**: 100+ files of the same subject (2x bonus multiplier)
**Multi-Format Variants**: Same audio in different qualities
**Complete Collections**: Related recordings of one subject

When uploading multiple files:
- All files are encrypted as a group
- All files receive the same rarity score
- All files share metadata (title, description, tags)
- All files count as one submission on the leaderboard
- Bulk bonus applies if 100+ samples total

## File Management Tips

**Before Uploading**:
- Test that files play correctly on your computer
- Ensure file names are clear (helps you organize later)
- Have files ready in one folder
- Close other applications to free up memory

**Organize Your Files**:
- Group similar recordings together
- Use clear naming: "Northern_Cardinal_Call_01.wav"
- Avoid special characters in filenames
- Note the total count (e.g., "100 samples total")

**Check Metadata**:
- Use a metadata editor (like MediaInfo) to verify technical specs
- Note duration of each file
- Verify sample rate and bit depth
- Check if files are stereo or mono

## Size and Time Considerations

**Small Files (under 10 MB total)**:
- Upload time: Seconds
- Verification time: 30-60 seconds

**Medium Files (10-100 MB total)**:
- Upload time: 30 seconds to 2 minutes
- Verification time: 1-3 minutes

**Large Files (100-500 MB total)**:
- Upload time: 2-5 minutes
- Verification time: 3-5 minutes

Internet speed affects upload time. Verification time depends on total duration of audio.

## Privacy During Selection

Important to know about file selection:

- Files stay on your computer during selection
- No files are uploaded until you explicitly click next
- Files are visible only on your screen
- SONAR cannot see or access files you have selected

Once you proceed to the next step, files will be uploaded to your browser's temporary storage before encryption.

## Next Step

When you are ready with your files, proceed to [Step 2: Metadata](metadata.md) to describe your audio.

If you have questions:
- See [Uploading Audio Overview](README.md) for general help
- Check [Getting Started](../getting-started/concepts.md) for privacy and security details
