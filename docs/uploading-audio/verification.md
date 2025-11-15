# Step 4: Verification

After encryption, your audio goes through six stages of AI verification. This ensures quality, copyright compliance, safety, and transcription accuracy.

## Why Verification?

Verification protects:

**You**: Ensures your submissions are valuable and legitimate
**Buyers**: Ensures they get quality, copyright-free audio
**The Marketplace**: Prevents spam, illegal content, and low-quality submissions
**The Community**: Maintains trust and platform integrity

Verification is thorough but automated. Most uploads complete in 2-3 minutes.

## The Six Verification Stages

### Stage 1: Quality Analysis (15%)

This stage checks technical audio quality.

**What Is Checked**:
- Duration: Between 1 second and 1 hour
- Sample rate: Minimum 8 kHz (higher is better)
- Silence level: Less than 30% silence
- Volume levels: Between -40dB and -6dB (optimal: -12dB to -3dB)
- Clipping: No distortion from recording too loud
- Format integrity: File is valid and not corrupted

**What It Means**:
- Your audio is complete and usable
- Volume is consistent and audible
- Recording equipment was adequate
- File is not damaged

**Why It Matters**:
- Low-quality audio is harder to use for AI training
- Too quiet or too loud audio requires cleanup
- Clipped audio cannot be recovered
- Damaged files cannot be trusted

**Pass Rate**: 95%+ of legitimate audio passes. Typical failures: too quiet, excessive clipping.

### Stage 2: Copyright Detection (35%)

This stage checks if your audio matches known copyrighted works.

**What Is Checked**:
- Chromaprint fingerprinting: Creates acoustic fingerprint of your audio
- AcoustID database: Compares against 100+ million registered works
- Confidence threshold: High-confidence matches (80%+) are flagged
- Exact duplicates: Exact copies of your own previous submissions

**What It Means**:
- Your audio is original (not a copy)
- No registered copyright holder can claim ownership
- You likely recorded or own this audio

**Why It Matters**:
- Buyers need copyright-free audio for commercial use
- Copyright violations would create legal liability
- Protecting creators ensures only legitimate submissions are published
- Duplicate submissions waste effort

**Limitations**:
- Only catches matches in 100+ million registered works
- Obscure or very recent works might not be registered yet
- Parody or transformative works still detected as matches
- If you own the copyright and registered it elsewhere, it may fail

**What to Do If Rejected**:
If your original recording matches a copyrighted work:
- If you own it: Register with AcoustID database
- If it is genuinely original: Contact support with proof of recording date
- Consider uploading a different recording

### Stage 3: Transcription (55%)

This stage converts speech to text (if applicable).

**What Is Checked**:
- Speech detection: Is there human or non-human speech?
- Language identification: What languages are spoken?
- Transcription accuracy: Converting speech to text
- Speaker identification: Multiple speakers detected
- Timestamps: When speech occurs in audio

**What It Means**:
- Speech in your audio is identified
- Text version of speech is created
- Languages are verified
- Multiple speakers are noted

**Why It Matters**:
- Transcriptions help AI training systems
- Verification of language tags
- Content analysis requires transcription
- Helps verify audio content matches description

**Processing**:
- Uses advanced AI (Mistral Voxtral Small)
- Supports multiple languages simultaneously
- Handles accents and dialects
- Identifies non-speech audio (music, ambient, etc.)

**What to Know**:
- Non-speech audio (animal sounds, mechanical) passes automatically
- Speech audio must be transcribable
- Heavily accented speech may have lower accuracy
- Multiple speakers increase complexity

### Stage 4: AI Analysis (75%)

This stage performs comprehensive content analysis.

**What Is Checked**:
- Audio quality score (0-1 scale)
- Content safety: Hate speech, violence, explicit content
- PII detection: Personal information in speech
- Content classification: What type of content is this?
- Sentiment and tone: Emotional tone of audio
- Insights and recommendations: What makes this audio valuable?

**What It Means**:
- Your audio is safe and compliant
- Quality is scored objectively
- Content is appropriate for marketplace
- Value and potential use cases identified

**Why It Matters**:
- Prevents harmful or unsafe content
- Flags PII for removal if necessary
- Scores content for rarity determination
- Provides insights for buyers

**Safety Categories**:
Flagged for rejection if containing:
- Hate speech or slurs
- Graphic violence or gore
- Explicit sexual content
- Threats or harassment
- Illegal activity descriptions
- Doxxing or PII exposure

Flagged for review if containing:
- Mild profanity
- Controversial topics
- Misinformation claims
- Legal gray areas

**Quality Scoring**:
Quality score (0-1 scale) is determined by:
- Technical specifications (sample rate, bit depth)
- Clarity and audibility
- Appropriate volume levels
- Minimal background noise (unless intentional)
- Absence of artifacts or distortion

### Stage 5: Aggregation (95%)

This stage combines all analysis into a final verification decision.

**What Is Checked**:
- All previous stages passed?
- No critical issues detected?
- Content meets safety standards?
- Quality meets marketplace minimum?
- Metadata matches audio content?
- File integrity confirmed?

**Final Decision**:
- **Approved**: Published to marketplace
- **Rejected**: Upload fails, see reason below
- **Manual Review**: Escalated for human review (rare)

**Possible Rejection Reasons**:
- "Audio too quiet" (quality issue)
- "Copyrighted content detected" (copyright issue)
- "Excessive silence" (quality issue)
- "Hate speech detected" (safety issue)
- "Unable to transcribe" (speech issue)
- "File corrupted" (integrity issue)

### Stage 6: Finalization (100%)

This stage completes the verification process.

**What Happens**:
- Results are stored in database
- Metadata is saved
- Verification timestamp recorded
- Your audio is ready for blockchain publication
- You receive verification summary

**Information Provided**:
- Verification status (passed/failed)
- Quality score (0-100)
- Rarity score estimate (0-100)
- Specific insights (language detected, speakers, etc.)
- Recommendations (if applicable)
- Next steps

## Monitoring Progress

### Real-Time Progress

During verification, you will see:
- Progress bar (0-100%)
- Current stage name
- Stage description
- Estimated time remaining
- Can pause or cancel if needed

### Typical Timeline

**Short Audio (1-5 minutes)**: 1-2 minutes verification
**Medium Audio (5-30 minutes)**: 2-3 minutes verification
**Long Audio (30+ minutes)**: 3-5 minutes verification

Times are relatively independent of length because most stages run in parallel.

### What If Verification Takes Long?

Long verification times can happen for:
- Large file uploads (slower network)
- Complex audio (multiple speakers, languages)
- Server load (busy times, slower processing)
- Technical issues (may require retry)

You can check:
- Are all stages progressing?
- Is there an error message?
- Is your internet still connected?
- Can you wait a bit longer?

## If Verification Fails

### See the Reason

You will see exactly why verification failed. Common reasons:

**Quality Issues**:
- "Audio is too quiet" (below -40dB)
- "Audio is clipping" (distorted/too loud)
- "Excessive silence (over 30%)"
- "Audio too short" (under 1 second)
- "Audio too long" (over 1 hour)
- "Sample rate too low" (below 8 kHz)

**Copyright Issues**:
- "High-confidence match detected"
- "Copyrighted content identified"
- "Duplicate of previous submission"

**Safety Issues**:
- "Hate speech detected"
- "Violent content detected"
- "Explicit content flagged"
- "PII exposure detected"

**Transcription Issues**:
- "Unable to transcribe speech"
- "Incomprehensible audio"
- "No clear language detected"

**Technical Issues**:
- "File corrupted or invalid"
- "Format not supported"
- "Processing error (try again)"

### What to Do

1. **Read the failure reason carefully**
2. **Fix the specific issue**:
   - Too quiet? Re-record with better microphone
   - Copyright match? Use different audio or file copyright claim
   - Safety flag? Remove problematic content
   - Transcription failed? Ensure clear speech
3. **Upload corrected version**
4. **Try again**

Each rejected upload teaches you what to fix next time.

### Appeals Process

If you believe the rejection is incorrect:
1. Note the rejection reason and timestamp
2. Contact support with:
   - Your submission ID
   - The rejection reason
   - Explanation of why you believe it is incorrect
   - Proof (if applicable)
3. Support team reviews and may overturn decision

## Privacy During Verification

### What SONAR Sees

During verification, your audio is:
- Decrypted temporarily (with your authorization via SessionKey)
- Analyzed by AI algorithms
- Plaintext discarded after analysis
- Never stored unencrypted
- Never reviewed by humans

### What SONAR Does Not See

- Your encryption keys
- Previous uploads (each is isolated)
- Your personal information (except metadata you provided)
- Your other datasets (unless verified separately)

### Verification Authorization

Verification requires:
- Your SessionKey (proof you own the audio)
- Your explicit permission (clicking "verify")
- Your metadata (title, description, tags)

You authorize exactly what is verified and can review the process anytime.

## After Verification

### If Approved

1. You see "Verification Passed" confirmation
2. Review the analysis results
3. See estimated rarity score (preliminary)
4. Click "Publish to Blockchain"
5. Sign the blockchain transaction
6. Your dataset is published and appears in marketplace

### If Rejected

1. You see "Verification Failed" with reason
2. Audio is discarded (not published)
3. You can try uploading again
4. No tokens are awarded for rejected submissions
5. No blockchain transaction required

## Common Questions

**Q: Why was my audio rejected when it sounds fine to me?**
SONAR uses objective technical standards. "Sounds fine" subjectively is different from meeting technical minimums for AI training.

**Q: Can I re-upload rejected audio?**
Yes, you can try again. Fix the specific issue and upload again.

**Q: Does verification take longer for longer audio?**
Slightly longer, but not proportional. A 1-hour file takes about 3-5 minutes, while a 5-minute file takes about 2-3 minutes.

**Q: Is verification really AI only?**
Mostly. Safety and copyright stages are automated. Rejected submissions are not manually reviewed unless you appeal.

**Q: Can I see the transcription results?**
Yes, after verification passes, you can see the transcription in the verification summary.

**Q: What if I disagree with the quality score?**
Quality score is based on technical specifications, not subjective opinion. You can appeal if you believe the scoring is wrong.

## Next Step

Once verification passes, proceed to [Step 5: Publishing](publishing.md) to register your dataset on the blockchain.

For more details:
- [Verification Pipeline Technical Details](../technical/verification-pipeline.md)
- [Understanding Audio Quality](../rarity-system/rarity-scoring.md)
- [Safety Guidelines](../getting-started/README.md)
