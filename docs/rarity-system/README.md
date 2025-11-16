# Understanding the Rarity System

The Rarity System is how SONAR determines the value of your audio. High-rarity, high-quality audio earns more points and higher leaderboard rankings. Points are redeemable for SNR tokens in a future airdrop.

## Overview

Your audio is scored on multiple dimensions:

**Rarity Score** (0-100): How unique is this audio compared to what already exists?
**Quality Score** (0-100): Technical audio quality and production value
**Specificity Grade** (A-F): How detailed and specific is the content?
**Verification Status**: Are the claims about the audio verified?
**Subject Rarity Tier**: How rare is the main subject (bird species, equipment, accent, etc.)?
**Saturation Status**: How many similar submissions already exist?
**Bulk Status**: Did you submit 100+ samples at once?

These factors combine using the Points System to determine how many points you earn toward the future SNR airdrop.

## The Core Concept

SONAR rewards rarity and quality. Think of it this way:

**Common Audio** (dog barking, traffic noise, generic speech): Low value, low points
**Decent Audio** (specific bird species, clear accent, vintage equipment): Medium value, medium points
**Rare Audio** (endangered bird, unique accent, rare equipment): High value, high points

The system automatically researches each subject to determine true rarity, not just perceived rarity.

## Key Metrics

### Rarity Score (0-100)

Determined by:
- Subject rarity tier (5x multiplier for critical species down to 0.5x for oversaturated)
- Specificity grade (A=highly specific, F=generic)
- Saturation level (fewer similar submissions = higher score)
- Quality (technical specifications)

**0-25**: Low rarity (common audio)
**25-50**: Moderate rarity (some existing submissions)
**50-75**: High rarity (few similar submissions)
**75-100**: Extremely rare (unique or endangered subjects)

### Quality Score (0-100)

Determined by:
- Sample rate (48kHz+ is ideal)
- Bit depth (24-bit better than 16-bit)
- Volume levels (optimal range: -12dB to -3dB peak)
- Absence of clipping or distortion
- Absence of excessive noise

**0-25**: Poor (too quiet, clipped, noisy)
**25-50**: Fair (acceptable but room for improvement)
**50-75**: Good (professional quality)
**75-100**: Excellent (studio or high-resolution quality)

### Specificity Grade (A-F)

How detailed and specific is your audio?

**Grade A**: Highly detailed, specific variants
- Example: "Golden Retriever puppy, 8-week-old female, high-energy play session, outdoor suburban park, sunny 72 degree weather"

**Grade B**: Good detail, mostly specific
- Example: "Golden Retriever puppy, play session, outdoor park"

**Grade C**: Adequate detail, somewhat specific
- Example: "Golden Retriever, outdoor sounds"

**Grade D**: Generic with some specific elements
- Example: "Dog sounds, recorded outdoors"

**Grade E-F**: Very generic or minimal detail
- Example: "Dog"

More specific = higher multiplier (A=1.3x, F=1.0x)

### Subject Rarity Tier

Every subject is classified into one of five tiers:

**Critical (5.0x multiplier)**: Endangered species, extinct sounds, unique cultural audio
- Javan Hawk-Eagle calls
- Native American ceremonial chants
- 1950s vinyl recording techniques
- First recordings of newly discovered species

**High (3.0x multiplier)**: Rare species, vintage equipment, uncommon dialects
- Babirusa pig calls
- 1960s rotary telephone rings
- Welsh speakers over age 80
- Rare regional accents

**Medium (2.0x multiplier)**: Some recordings exist, regional variants
- Cardinal songs with regional dialect differences
- Modern smartphone notification sounds
- Common regional accents

**Standard (1.0x multiplier)**: Common, widely available subjects
- Common dog breeds
- English language generic speech
- Typical office environments

**Oversaturated (0.5x multiplier)**: Extremely common, widely recorded
- Generic dog barking
- Common bird calls (robin, sparrow)
- Generic traffic noise

SONAR automatically researches each subject using web search to determine its true rarity.

### Saturation Status

How many similar submissions already exist?

**Emerging** (0-24 similar submissions): No penalty
**Moderate** (25-49 similar): Small penalty (-5 to -10 points)
**High** (50-99 similar): Medium penalty (-15 to -25 points)
**Heavy** (100-199 similar): Large penalty (-30 to -40 points)
**Severe** (200+ similar): Severe penalty (-45 to -55 points)

Important: Saturation thresholds are dynamic based on subject rarity:
- Critical subjects: 125 similar before penalty
- High rarity: 75 similar before penalty
- Standard subjects: 25 similar before penalty
- Oversaturated: 12 similar before penalty

This rewards exploring rare subjects even if someone else has submitted similar audio.

## How Points Are Calculated

Your points are calculated using this formula:

Points = Rarity Score × 6 Multipliers

The six multipliers are:
1. **Quality Multiplier** (1.0-1.5x): Based on technical audio quality
2. **Bulk Multiplier** (1.0-2.0x): Bonus for 100+ samples in one submission
3. **Subject Rarity Multiplier** (0.5-5.0x): Based on how rare the subject is
4. **Specificity Multiplier** (1.0-1.3x): Based on Grade A-F
5. **Verification Multiplier** (1.0-1.2x): Bonus if AI verified your claims
6. **Early Contributor Multiplier** (1.0-1.5x): Bonus for submitting early

Example: 85 rarity × 1.4 quality × 2.0 bulk × 3.0 subject × 1.2 specificity × 1.1 verification × 1.3 early = ~8,800 points

See [Points System](points-system.md) for detailed breakdown.

## Your Leaderboard Position

Your position on the global leaderboard is based on:
- **Total Points**: All-time accumulated points
- **Tier**: Current achievement level
- **Consistency**: Regular submissions over time
- **Diversity**: Different subjects and types

Rank updates hourly and historical snapshots are saved daily.

See [Leaderboard Guide](leaderboard.md) for how rankings work.

## Tiers and Progression

As you accumulate points, you advance through tiers:

**Legend** (100,000+ points): Top creators, maximum recognition
**Diamond** (50,000+ points): Elite creators
**Platinum** (25,000+ points): Proven creators
**Gold** (10,000+ points): Serious contributors
**Silver** (5,000+ points): Active contributors
**Bronze** (1,000+ points): Established contributors
**Contributor** (0+ points): Starting tier

Each tier unlocks achievements and increases your airdrop eligibility.

See [Tiers Guide](tiers.md) for details on progression and benefits.

## Achievements

Achievements (badges) recognize specific accomplishments and are unlocked automatically:

**Milestone Achievements**: Based on submission count or point thresholds
**Rarity Achievements**: Based on submitting rare audio
**Quality Achievements**: Based on maintaining high standards
**Tier Achievements**: Based on reaching tier milestones
**Diversity Achievements**: Based on submitting varied content

See [Achievements Guide](achievements.md) for the complete list of 20 badges.

## Airdrop Eligibility

Periodically, SONAR distributes bonus tokens to creators. Your eligibility is determined by five factors:

- **Total Points** (50% weight): Your cumulative points
- **Submission Diversity** (20% weight): Number of unique subjects
- **First Bulk Contributions** (15% weight): How many subjects you bulk-submitted first
- **Rare Subject Contributions** (10% weight): Critical and high-rarity submissions
- **Consistency** (5% weight): Submissions across different days

Higher eligibility scores receive larger airdrop allocations.

See [Airdrop Guide](airdrop.md) for calculation details.

## Strategy Guide

Tips for maximizing your rarity scores and point allocation:

**Target Rare Subjects**: Endangered species, vintage equipment, uncommon accents earn 3-5x multipliers
**Be Specific**: "Golden Retriever puppy, 8 weeks old..." earns 1.3x vs "Dog"
**High Quality**: 48kHz or better sample rate earns quality bonuses
**Bulk Submissions**: Submit 100+ samples at once for 2x multiplier
**Early Participation**: First contributors get 1.5x bonus
**Diversify**: Submit 20+ different subjects for airdrop bonus
**Complete Data**: Comprehensive datasets of a subject earn higher scores

See [Strategy Guide](strategy.md) for detailed tips and examples.

## Guides in This Section

- **[Rarity Scoring](rarity-scoring.md)** - How rarity is determined for each subject
- **[Points System](points-system.md)** - The 6-multiplier formula
- **[Tiers](tiers.md)** - Tier progression and benefits
- **[Leaderboard](leaderboard.md)** - How rankings work
- **[Achievements](achievements.md)** - All 20 badges and unlock criteria
- **[Airdrop](airdrop.md)** - Eligibility and allocation
- **[Strategy](strategy.md)** - Tips for maximizing points

## Key Takeaway

The Rarity System rewards:
- Rarity: Rare subjects earn exponentially more
- Quality: Professional audio earns bonuses
- Specificity: Detailed descriptions earn higher scores
- Bulk contributions: Large datasets get multipliers
- Early participation: First contributors to a subject earn the most
- Consistency: Regular submissions build reputation
- Diversity: Varied submissions maximize airdrop allocation

Understand these systems and you can strategically maximize your points toward the SNR airdrop.
