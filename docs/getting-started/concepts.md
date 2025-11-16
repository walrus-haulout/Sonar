# Key Concepts

These concepts are fundamental to understanding SONAR. Familiarize yourself with them before diving deeper.

## Encryption and Privacy

### Client-Side Encryption

Your audio is encrypted on your computer before uploading. This means:
- SONAR servers never see your plaintext (unencrypted) audio
- Your encrypted audio is stored on decentralized servers
- Only people you authorize can decrypt it

This is different from typical cloud services where the company holds your unencrypted data.

### SEAL Threshold Cryptography

SONAR uses Mysten SEAL for advanced encryption:
- Your audio key is split into three shares
- Each share is encrypted and held by a different server
- Requires ANY 2 out of 3 servers to decrypt
- Even if one server is compromised, your audio remains safe

This means no single entity can decrypt your data alone. It requires coordination between multiple independent servers.

## Rarity and Scoring

### What Makes Audio Rare?

Audio rarity depends on multiple factors:

**Subject Rarity**: How common is the main subject?
- Endangered species = very rare (5x value)
- Vintage equipment = rare (3x value)
- Common animals = low rarity (1x value)
- Oversaturated subjects = negative value (0.5x)

**Specificity**: How detailed and specific is your audio?
- "Golden Retriever puppy, 8 weeks old, high-energy play session, outdoor park setting" = very specific
- "Dog barking" = generic
- More specific = higher points

**Saturation**: How many similar submissions already exist?
- First submission of a subject = highest points
- 25+ similar submissions = penalties apply
- 200+ similar submissions = severe penalties

**Quality**: Technical audio quality
- High sample rate (48kHz or better)
- Good volume levels
- Minimal noise or clipping

### Rarity Tiers

Every subject falls into one of five rarity tiers:

**Critical (5x multiplier)**: Endangered species, extinct sounds, unique cultural audio. Examples: Javan Hawk Eagle calls, Native American ceremonial chants, 1950s vinyl recording techniques.

**High (3x multiplier)**: Rare species, vintage equipment, uncommon dialects. Examples: Babirusa pig calls, 1960s rotary telephone rings, Welsh language speakers over 80.

**Medium (2x multiplier)**: Some existing recordings available, regional variants. Examples: Common songbirds with regional dialect differences, modern telephone sounds.

**Standard (1x multiplier)**: Common subjects, widely available. Examples: Common dog breeds, typical office environments.

**Oversaturated (0.5x multiplier)**: Extremely common, widely recorded. Examples: Generic speech, common urban ambient noise.

## Points and Rewards

### Points Formula

Your points are calculated as:

Points = Rarity Score × 6 Multipliers

The six multipliers are:
1. Quality (1.0 to 1.5x)
2. Bulk Contribution (1.0 to 2.0x)
3. Subject Rarity (0.5 to 5.0x)
4. Specificity Grade (1.0 to 1.3x)
5. Verification Status (1.0 to 1.2x)
6. Early Contributor (1.0 to 1.5x)

These multiply together, so combining high values creates exponential rewards.

Example: A submission with rarity score 85, all multipliers at 1.3x or higher:
85 × 1.4 × 1.5 × 3.0 × 1.2 × 1.1 × 1.3 = ~7,000 points

### Revenue Model

You earn in two ways:

**Points System**: Points earned from uploads are redeemable for SNR tokens in a future airdrop

**Purchase Revenue**: When buyers purchase your datasets, you receive 60% of the purchase price, vested daily over 30 days

## Leaderboard and Tiers

### Tier System

You progress through seven tiers as you earn more points:

**Legend** (100,000+ points): Top creators, massive recognition
**Diamond** (50,000+ points): Elite creators
**Platinum** (25,000+ points): Proven creators
**Gold** (10,000+ points): Serious contributors
**Silver** (5,000+ points): Active contributors
**Bronze** (1,000+ points): Established contributors
**Contributor** (0+ points): Everyone starts here

### What Tiers Do

- Show your status in the community
- Affect your airdrop eligibility
- Unlock achievements at certain thresholds
- Visible on your profile and the leaderboard

## Achievements

Achievements (or badges) recognize specific accomplishments:

**Milestone Achievements**: Unlock at submission or point milestones (First Blood, Content Creator, Point Collector, etc.)

**Rarity Achievements**: Unlock by submitting rare audio (Rare Hunter I/II, Bulk Pioneer, etc.)

**Quality Achievements**: Unlock by maintaining high quality standards (Quality Master, Perfectionist, etc.)

**Diversity Achievements**: Unlock by submitting varied audio types (Diversity King, etc.)

**Timing Achievements**: Unlock by consistent participation (Early Adopter, Consistent Contributor, etc.)

Achievements are purely recognition and demonstrate your profile credibility.

## Airdrop and Distribution

### What is an Airdrop?

SONAR periodically distributes bonus tokens to active creators. Your share depends on:
- Your total points (50% weight)
- Diversity of subjects (20% weight)
- First bulk contributions (15% weight)
- Rare subject submissions (10% weight)
- Consistency across time (5% weight)

The system rewards balanced participation, not just high volume.

### Eligibility

To be eligible for airdrops, you must:
- Have at least 1 submission
- Have earned minimum 10% of maximum possible airdrop score
- Maintain activity in the system

### Allocation

Each eligible creator receives a percentage of total airdrop pool:
Your Share % = (Your Eligibility Score / All Eligible Users' Total Scores) × 100%

This means your airdrop amount depends on how you compare to other creators, not a fixed amount.

## Saturation Penalties

### How Saturation Works

When many similar submissions exist for a subject, penalties apply:

**Emerging** (0-24 similar): No penalty, full points
**Moderate** (25-49 similar): Small penalty (-5 to -10 points)
**High** (50-99 similar): Medium penalty (-15 to -25 points)
**Heavy** (100-199 similar): Large penalty (-30 to -40 points)
**Severe** (200+ similar): Severe penalty (-45 to -55 points)

### Dynamic Thresholds

The threshold before penalties apply varies by subject rarity:

**Critical subjects**: 125 similar submissions before penalties (5x threshold)
**High rarity subjects**: 75 similar submissions before penalties (3x threshold)
**Standard subjects**: 25 similar submissions before penalties (1x threshold)
**Oversaturated subjects**: 12 similar submissions before penalties (0.5x threshold)

This means rare subjects can have many more submissions before being penalized, encouraging exploration of unique audio.

## Bulk Contributions

### Bulk Thresholds

A "bulk" submission is 100 or more samples in a single upload.

### Bulk Bonuses

**First Bulk for a Subject** (2.0x multiplier): You are the first person to submit 100+ samples. This is the highest bonus.

**Subsequent Bulk** (1.2x multiplier): Others already submitted bulk for this subject.

**Single Submission** (1.0x multiplier): Fewer than 100 samples.

Bulk contributions are valuable because they provide comprehensive data for a single subject.

## Verification Process

### What Gets Verified?

During verification, SONAR analyzes your audio for:

**Quality**: Duration (1s-1hr), sample rate (8kHz minimum), clipping, silence levels
**Copyright**: Fingerprinting against known copyrighted works
**Transcription**: Converting speech to text (if applicable)
**Safety**: Detecting hate speech, violence, or other violations

### Why Verification?

Verification protects the marketplace:
- Prevents copyrighted music from being sold as original
- Blocks low-quality audio from cluttering the marketplace
- Ensures safety and compliance
- Builds trust with buyers

### Authorization

Verification happens using your encrypted audio. We decrypt it temporarily only to analyze it, then discard the plaintext. We never store or misuse your plaintext data.

## Blockchain and Smart Contracts

### Why Blockchain?

The Sui blockchain records:
- Your ownership of each dataset
- Timestamps proving you submitted first
- Purchase transactions
- Reward distributions
- Airdrop allocations

Blockchain ensures transparency and prevents anyone from falsifying records.

### Transactions

When you upload, you sign transactions that:
- Register your dataset on-chain
- Record your encrypted blob reference
- Allocate initial token rewards
- Establish payment splits for future purchases

All transactions are public and verifiable.

## Decentralized Storage (Walrus)

### What is Walrus?

Walrus is a decentralized blob storage system that:
- Stores your encrypted audio
- Is not owned by any single company
- Remains available indefinitely if stored there
- Cannot be arbitrarily deleted or modified

### How It Works

Your encrypted audio is stored as a "blob" on Walrus:
- Multiple independent nodes store copies
- If one node goes down, others keep it available
- You store it once, and it stays there forever
- Payments ensure long-term storage

This is different from cloud services where a company can delete your data whenever they want.

## Summary

These concepts work together to create a fair, private, and sustainable audio marketplace:
- **Encryption** protects your privacy
- **Rarity and Scoring** ensure fair compensation
- **Verification** maintains marketplace quality
- **Blockchain** provides transparency
- **Decentralized Storage** ensures permanence
- **Leaderboard and Achievements** foster community
- **Airdrops** reward consistent participation

Now that you understand these fundamentals, you are ready to explore specific topics in depth.
