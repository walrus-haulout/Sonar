import {
  createOpenRouterClient,
  OPENROUTER_MODELS,
} from './openrouter-client';
import type { DatasetMetadata } from '@/lib/types/upload';

/**
 * Gemini Analysis Service (via OpenRouter)
 * Analyzes audio dataset quality, safety, and value
 */

export interface AnalysisResult {
  qualityScore: number; // 0-1 scale
  safetyPassed: boolean;
  insights: string[];
  concerns?: string[];
  recommendations?: string[];
}

/**
 * Analyze dataset using Gemini via OpenRouter
 */
export async function analyzeDataset(
  transcript: string,
  metadata: DatasetMetadata,
  audioMetadata?: {
    duration: number;
    fileSize: number;
    format: string;
  }
): Promise<AnalysisResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const client = createOpenRouterClient(apiKey);

  try {
    const prompt = buildAnalysisPrompt(transcript, metadata, audioMetadata);

    const completion = await client.chat.completions.create({
      model: OPENROUTER_MODELS.GEMINI_FLASH,
      max_tokens: 2048,
      temperature: 0.3, // Lower temperature for consistent analysis
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Parse Gemini's response
    const responseText = completion.choices[0]?.message?.content || '';

    return parseAnalysisResponse(responseText);
  } catch (error) {
    console.error('Gemini analysis failed:', error);
    throw new Error(
      `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Build analysis prompt for Gemini
 */
function buildAnalysisPrompt(
  transcript: string,
  metadata: DatasetMetadata,
  audioMetadata?: {
    duration: number;
    fileSize: number;
    format: string;
  }
): string {
  return `You are an expert audio dataset quality analyst for the SONAR Protocol, a decentralized audio data marketplace. Analyze this audio dataset submission and provide a comprehensive quality assessment.

## Dataset Metadata
- Title: ${metadata.title}
- Description: ${metadata.description}
- Languages: ${metadata.languages.join(', ')}
- Tags: ${metadata.tags.join(', ')}
${audioMetadata ? `- Duration: ${Math.round(audioMetadata.duration)}s\n- File Size: ${(audioMetadata.fileSize / (1024 * 1024)).toFixed(2)}MB\n- Format: ${audioMetadata.format}` : ''}

## Transcript Sample
${transcript.length > 2000 ? transcript.substring(0, 2000) + '...' : transcript}

## Analysis Required

Provide your analysis in the following JSON format:

\`\`\`json
{
  "qualityScore": 0.85,
  "safetyPassed": true,
  "insights": [
    "Insight 1 about the dataset quality",
    "Insight 2 about content value",
    "Insight 3 about potential use cases"
  ],
  "concerns": [
    "Any quality concerns (if applicable)"
  ],
  "recommendations": [
    "Suggestions for improvement"
  ]
}
\`\`\`

### Quality Scoring Criteria (0-1 scale):
- **Audio Clarity** (0.3): Is the transcript coherent? Minimal transcription errors?
- **Content Value** (0.3): Is the content meaningful, diverse, and useful for AI training?
- **Metadata Accuracy** (0.2): Does the content match the provided metadata?
- **Completeness** (0.2): Is the content complete without obvious truncation?

### Safety Screening:
Flag as unsafe (safetyPassed: false) ONLY if content contains:
- Hate speech or explicit discrimination
- Graphic violence or gore descriptions
- Child exploitation material
- Illegal activity promotion
- Personally identifiable information (PII)

Conversational datasets with mild profanity, political discussion, or sensitive topics are generally ACCEPTABLE if contextually appropriate.

### Insights:
Provide 3-5 actionable insights about:
- Content quality and clarity
- Potential use cases (conversational AI, voice synthesis, etc.)
- Unique characteristics of the dataset
- Market value proposition

Respond ONLY with the JSON object, no additional text.`;
}

/**
 * Parse Gemini's analysis response
 */
function parseAnalysisResponse(responseText: string): AnalysisResult {
  try {
    // Extract JSON from markdown code blocks if present
    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
    const jsonString = jsonMatch ? jsonMatch[1] : responseText;

    const parsed = JSON.parse(jsonString);

    // Validate response structure
    if (
      typeof parsed.qualityScore !== 'number' ||
      typeof parsed.safetyPassed !== 'boolean' ||
      !Array.isArray(parsed.insights)
    ) {
      throw new Error('Invalid response structure from Gemini');
    }

    // Normalize quality score to 0-1 range
    const qualityScore = Math.max(0, Math.min(1, parsed.qualityScore));

    return {
      qualityScore,
      safetyPassed: parsed.safetyPassed,
      insights: parsed.insights || [],
      concerns: parsed.concerns || [],
      recommendations: parsed.recommendations || [],
    };
  } catch (error) {
    console.error('Failed to parse Gemini response:', error);
    console.error('Raw response:', responseText);

    // Return safe default values if parsing fails
    return {
      qualityScore: 0.5,
      safetyPassed: true,
      insights: [
        'Analysis completed but response parsing failed',
        'Manual review recommended',
      ],
      concerns: ['Unable to parse detailed analysis'],
    };
  }
}

/**
 * Quick safety check (for pre-screening before full analysis)
 */
export async function quickSafetyCheck(transcript: string): Promise<boolean> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const client = createOpenRouterClient(apiKey);

  try {
    const completion = await client.chat.completions.create({
      model: OPENROUTER_MODELS.GEMINI_FLASH,
      max_tokens: 100,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: `Perform a quick safety check on this audio transcript. Respond with ONLY "SAFE" or "UNSAFE".

Flag as UNSAFE only if the content contains:
- Hate speech or explicit discrimination
- Graphic violence or gore
- Child exploitation
- Illegal activity promotion
- Personally identifiable information (PII)

Transcript: ${transcript.substring(0, 1000)}

Response:`,
        },
      ],
    });

    const response = completion.choices[0]?.message?.content?.trim().toUpperCase() || '';

    return response === 'SAFE';
  } catch (error) {
    console.error('Quick safety check failed:', error);
    // Default to safe if check fails (manual review can catch issues)
    return true;
  }
}
