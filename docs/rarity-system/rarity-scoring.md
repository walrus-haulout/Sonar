# How Rarity Scoring Works

Rarity scoring determines how valuable your audio is. This page explains how SONAR determines if something is truly rare versus just perceived to be rare.

## The Five Subject Rarity Tiers

Every subject submitted to SONAR falls into one of five rarity tiers. SONAR automatically researches each subject to assign the correct tier.

### Critical Tier (5.0x multiplier)

Critical subjects are extremely rare or unique. These earn the highest multipliers.

**Examples**:
- Javan Hawk-Eagle calls (only ~500 birds left in wild)
- Vaquita porpoise vocalizations (fewer than 10 individuals)
- Baiji dolphin recordings (functionally extinct)
- Native American ceremonial chants (restricted cultural audio)
- Extinct animal sounds (reconstructed from historical recordings)
- Languages with fewer than 100 speakers
- First recordings of newly discovered species

**Why Critical**:
- Extremely difficult or impossible to record
- Endangered or extinct subject
- Unique cultural or historical significance
- No existing comprehensive dataset

**Token Multiplier**: 5.0x (300-point rarity score becomes 1,500 with multiplier)
**Dynamic Saturation Threshold**: 125 similar submissions before penalties apply

### High Rarity Tier (3.0x multiplier)

High rarity subjects are uncommon. Few recordings exist.

**Examples**:
- Babirusa pig vocalizations (rare species, few recordings)
- 1960s rotary telephone sounds (vintage equipment, mostly retired)
- Welsh language speakers over age 80 (declining population)
- Certain regional accents (becoming homogenized)
- Rare equipment models (discontinued or scarce)
- Bird species with limited geographic range
- Rare plant sounds (seed pods, leaf movements)

**Why High Rarity**:
- Difficult to record or rare to encounter
- Limited existing recordings
- Geographic or temporal constraints
- Endangered or uncommon subject

**Token Multiplier**: 3.0x
**Dynamic Saturation Threshold**: 75 similar submissions before penalties apply

### Medium Tier (2.0x multiplier)

Medium rarity subjects have some existing recordings but offer variants or improvements.

**Examples**:
- Common bird species (Robin, Sparrow) with regional dialect differences
- Modern consumer technology (smartphone notifications in different languages)
- Common regional accents (Texan, Southern, Boston)
- Standard musical instruments played in unusual ways
- Weather sounds in specific climates
- Vehicle engines from specific years/models

**Why Medium Rarity**:
- Some recordings exist already
- Subject is somewhat common
- But specific variants are less common
- Niche interest but accessible

**Token Multiplier**: 2.0x
**Dynamic Saturation Threshold**: 50 similar submissions before penalties apply

### Standard Tier (1.0x multiplier)

Standard subjects are common with many existing recordings.

**Examples**:
- Common dog breeds (Golden Retriever, Labrador)
- English language generic speech
- Typical office environment sounds
- Rain and thunder (generic)
- City traffic (generic)
- Standard musical instruments (piano, guitar)

**Why Standard**:
- Easy to record
- Many existing recordings
- No special difficulty or rarity
- General interest

**Token Multiplier**: 1.0x (no bonus)
**Dynamic Saturation Threshold**: 25 similar submissions before penalties apply

### Oversaturated Tier (0.5x multiplier)

Oversaturated subjects have so many recordings that new submissions add little value.

**Examples**:
- Generic dog barking
- Common bird calls (American Robin, Carolina Wren)
- Generic traffic noise
- Repetitive human sounds (coughing, sneezing in isolation)
- Generic ambient noise
- Heavily synthesized sounds

**Why Oversaturated**:
- Extremely common
- Hundreds or thousands of recordings exist
- Little differentiation between submissions
- Diminishing value for additional submissions

**Token Multiplier**: 0.5x (penalty)
**Dynamic Saturation Threshold**: 12 similar submissions before penalties apply

## How SONAR Researches Rarity

SONAR uses web search and AI to determine each subject's true rarity:

### Step 1: Subject Extraction

Your audio title and description are analyzed to extract the main subject:
- "Javan Hawk-Eagle territorial calls from Gunung Halimun National Park"
- → Subject: "Javan Hawk-Eagle (Nisaetus bartelsi)"

### Step 2: Web Research

SONAR researches the subject:
- Conservation status (IUCN Red List)
- Population estimates
- Geographic range
- Existing recordings and datasets
- Scientific literature
- Market demand

### Step 3: Data Analysis

System checks existing SONAR submissions:
- How many similar submissions already exist?
- What are their rarity scores?
- What is the saturation level?

### Step 4: Tier Assignment

Based on research, SONAR assigns a tier:
- Endangered + few recordings = Critical
- Rare + some recordings = High
- Common + variants = Medium
- Very common = Standard
- Ubiquitous = Oversaturated

### Step 5: Dynamic Threshold

The saturation penalty threshold is set:
- Critical: 125 similar before penalty
- High: 75 similar before penalty
- Standard: 25 similar before penalty
- Oversaturated: 12 similar before penalty

This means a critical species can have 5x more submissions before saturation penalties apply.

## Subject Rarity Examples

### Bird Sounds

**Critical** (5.0x):
- Javan Hawk-Eagle (endangered, few wild recordings)
- Kiwi bird calls (endangered, nocturnal, difficult to record)
- Philippine Eagle vocalizations (critically endangered)

**High** (3.0x):
- Secretary bird calls (rare, specific habitat)
- Crowned crane duets (regionally limited)
- Lyrebird mimicry (impressive but well-known)

**Medium** (2.0x):
- Cardinal calls (common but regional variants exist)
- Owl hoots (common but species-specific variants)
- Crow calls (common with regional variations)

**Standard** (1.0x):
- Robin songs (very common)
- Sparrow chirps (very common)

**Oversaturated** (0.5x):
- Generic bird chirping
- Unidentified bird sounds

### Human Accents and Speech

**Critical** (5.0x):
- Speakers of languages with fewer than 100 speakers
- Last native speakers of dying languages
- Unique cultural speech patterns

**High** (3.0x):
- Speakers over age 80 with regional accents (aging out)
- Rare dialects (Geordie, Scouse from specific generations)
- Immigrant accents combining two languages

**Medium** (2.0x):
- Regional accents (Brooklyn, Scottish, Welsh from younger speakers)
- Professional voice actors with rare ability
- Multilingual speakers in specific language pairs

**Standard** (1.0x):
- Standard American English
- London RP (Received Pronunciation)
- Generic professional speech

**Oversaturated** (0.5x):
- Generic speech
- "Person talking"

### Equipment and Mechanical Sounds

**Critical** (5.0x):
- 1920s mechanical sounds (rarely working examples)
- Edison cylinder phonograph operation
- Morse code machines

**High** (3.0x):
- 1960s rotary telephone systems
- Typewriter keyboards (specific models)
- Vintage cash register sounds
- Record player operations (specific models)

**Medium** (2.0x):
- 1980s computer sounds
- Early mobile phone effects
- Analog synthesizer tones
- Vintage game console sounds

**Standard** (1.0x):
- Modern computer sounds
- Contemporary phone notifications
- Current appliance sounds

**Oversaturated** (0.5x):
- Generic mechanical noise
- Common electronic beeps

## Specificity Multiplier

Within each tier, specificity also matters. A critical subject with high specificity earns more than a critical subject with low specificity.

**Grade A Specificity** (1.3x):
"Javan Hawk-Eagle pair territorial duet, male and female exchange, March 2024, Gunung Halimun-Salak National Park, Java, Indonesia, breeding season context, minimal wind noise, 96kHz stereo recording"

vs.

**Grade F Specificity** (1.0x):
"Bird sounds"

Both might be critical rarity, but A gets 1.3x multiplier from specificity.

## Quality as Rarity Modifier

Technical quality also affects rarity scoring:

**High-Quality Audio** (excellent sample rate, bit depth):
- 96kHz, 24-bit: No penalty
- 48kHz, 24-bit: No penalty
- 44.1kHz, 16-bit: Small penalty (-5%)

**Low-Quality Audio** (poor sample rate, bit depth):
- 8kHz, 8-bit: Large penalty (-20%)
- 16kHz, 8-bit: Medium penalty (-10%)

This prevents low-quality recordings of rare subjects from earning maximum points.

## Saturation Penalties

Once a subject reaches its dynamic threshold, penalties apply:

**Example: Critical Rarity Subject with 125+ submissions**

**0-24 similar**: No penalty, full rarity score
**25-49 similar**: -5 to -10 points penalty
**50-99 similar**: -15 to -25 points penalty
**100-199 similar**: -30 to -40 points penalty
**200+ similar**: -45 to -55 points penalty

This means the 200th submission of the same critical subject loses 45-55 points compared to the first.

**Important**: This is a penalty, not a multiplier. It reduces your base rarity score, and then the 6 multipliers are applied.

## Dynamic Thresholds Explained

Why do different subjects have different saturation thresholds?

**Critical Subjects** (125 threshold):
- Even 125 submissions is still a tiny fraction of possible variants
- Each submission of an endangered species has value
- Comprehensive datasets of critical species are needed

**Standard Subjects** (25 threshold):
- 25 submissions represents good coverage for a common subject
- Diminishing value beyond this point
- Prevents oversaturation of common sounds

This ensures rare subjects can have many more submissions before penalties apply, encouraging exploration of unique audio.

## Reviewing Your Rarity Score

After publishing, you can see:
- Your rarity score (0-100)
- Preliminary vs. final score (final may change after 1 week)
- Subject tier assigned
- Saturation level
- Similar submissions count
- Penalties applied

Your preliminary score shows at publication. Your final score is calculated after 1 week once saturation is fully analyzed.

## Next Steps

- Learn how rarity scores convert to points: [Points System](points-system.md)
- See strategy tips: [Strategy Guide](strategy.md)
- Understand tier progression: [Tiers](tiers.md)
