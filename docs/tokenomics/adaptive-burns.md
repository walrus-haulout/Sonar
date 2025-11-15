# Adaptive Token Burn Mechanics

SONAR uses adaptive burns to prevent the death spiral that kills most crypto projects.

## The Problem: Fixed Burns

Traditional crypto projects use fixed burn rates:

**Example**: "Burn 20% of every purchase"

As the project evolves:

```
Year 1: 1M tokens in circulation
  - 100k transactions
  - 200k tokens burned
  - 100k tokens created
  - Net: Supply shrinks

Year 2: 10M tokens in circulation
  - 100k transactions (same activity)
  - 2M tokens burned (same 20% rate)
  - 100k tokens created
  - Net: Severe deflationary pressure

Year 3: 100M tokens in circulation
  - 100k transactions (same activity)
  - 20M tokens burned (same 20% rate)
  - 100k tokens created
  - Net: Supply collapses
  - Problem: Token value required to skyrocket
```

This is unsustainable. As users reduce activity due to high costs, the project dies.

## SONAR's Solution: Adaptive Burns

SONAR adjusts burn rates dynamically based on circulating supply:

### Burn Rate Tiers

**Tier 1**: 50M+ SONAR in circulation
- Burn: 20%
- Creator Share: 50%
- Operations: 30%

**Tier 2**: 35-50M SONAR in circulation
- Burn: 15%
- Creator Share: 60%
- Operations: 25%

**Tier 3**: 20-35M SONAR in circulation
- Burn: 10%
- Creator Share: 65%
- Operations: 25%

**Tier 4**: Under 20M SONAR in circulation
- Burn: 0%
- Creator Share: 80%
- Operations: 20%

## How Adaptive Burn Prevents Death Spiral

### Year 1: Growth Phase

```
Circulating Supply: 1M SONAR (Tier 4)
Burn Rate: 0%
Creator Share: 80%

100k transactions
- Burned: 0 SONAR
- Creator Rewards: 80k SONAR
- Operations: 20k SONAR
- Net change: +80k SONAR

Supply grows but not too fast
```

### Year 2: Healthy Growth

```
Circulating Supply: 25M SONAR (Tier 3)
Burn Rate: 10%
Creator Share: 65%

150k transactions (more activity due to growth)
- Burned: 15k SONAR
- Creator Rewards: 97.5k SONAR
- Operations: 37.5k SONAR
- Net change: +65k SONAR

Supply grows but controlled
```

### Year 3: Market Maturity

```
Circulating Supply: 45M SONAR (Tier 2)
Burn Rate: 15%
Creator Share: 60%

200k transactions (sustained activity)
- Burned: 30k SONAR
- Creator Rewards: 120k SONAR
- Operations: 50k SONAR
- Net change: +20k SONAR

Supply growth slows, burn increases
```

### Year 4: Equilibrium

```
Circulating Supply: 50M+ SONAR (Tier 1)
Burn Rate: 20%
Creator Share: 50%

200k transactions (stable activity)
- Burned: 40k SONAR
- Creator Rewards: 100k SONAR
- Operations: 60k SONAR
- Net change: -40k SONAR

Supply stabilizes: burn >= creation
```

## The Math

Each transaction worth X SONAR:

**Tier 1 (50M+)**:
- Distributed: X
- Creator gets: 0.5X
- Operations gets: 0.3X
- Burned: 0.2X
- Net supply change: +0.8X

**Tier 2 (35-50M)**:
- Distributed: X
- Creator gets: 0.6X
- Operations gets: 0.25X
- Burned: 0.15X
- Net supply change: +0.85X

**Tier 3 (20-35M)**:
- Distributed: X
- Creator gets: 0.65X
- Operations gets: 0.25X
- Burned: 0.1X
- Net supply change: +0.9X

**Tier 4 (Under 20M)**:
- Distributed: X
- Creator gets: 0.8X
- Operations gets: 0.2X
- Burned: 0X
- Net supply change: +X

## Creator Rewards Increase as Supply Grows

Counterintuitively, creators earn MORE as supply grows (even though burn increases):

```
1 Purchase = 100 SONAR transaction:

Tier 4 (under 20M):
- Creator receives: 80 SONAR

Tier 2 (35-50M):
- Creator receives: 60 SONAR

Tier 1 (50M+):
- Creator receives: 50 SONAR
```

Wait, that's less! But total purchasing volume is higher:

```
Year 1: 100 purchases × 100 SONAR = 10k total
- Creator share: 100% of supply growth

Year 4: 1,000 purchases × 100 SONAR = 100k total
- Creator share: 50% but much higher volume
- Year 1: 80k tokens (100 purchases × 80)
- Year 4: 50k tokens (1,000 purchases × 50)
```

Wait, that's still less per token. But:

1. Token value increases (supply controlled)
2. Purchase count increases (more users, more purchases)
3. Creator average quality increases (higher rarity scores)
4. Premium pricing becomes possible

Result: Creator earnings in fiat value increase substantially.

## Preventing Collapse

Adaptive burns prevent several failure modes:

### Scenario 1: Rapid Growth

If platform gets 10x users quickly:

Without adaptive burn:
- 20% burn on every purchase
- Costs rise dramatically
- New users can't afford to buy
- Activity drops off cliff
- Burn still happening (supply collapses)
- Project dies

With adaptive burn:
- Threshold increases to 50M+ (Tier 1)
- Burn stays at 20% or decreases
- Purchase costs manageable
- Continued growth supported
- Supply controlled
- Project thrives

### Scenario 2: Market Downturn

If activity drops:

Without adaptive burn:
- Fixed 20% burn on fewer purchases
- Burn becomes severe relative to activity
- Token holders see huge deflation
- Panic selling
- Price collapse
- Project dies

With adaptive burn:
- If supply drops below 20M (Tier 4)
- Burn drops to 0%
- Creator rewards increase to 80%
- Attracts quality creators
- Activity rebounds
- Supply stabilizes
- Project recovers

### Scenario 3: Equilibrium

If supply stabilizes around 50M:

With adaptive burn:
- 20% burn on each purchase
- Creator share 50%
- If activity stable, supply stable
- Deflationary but sustainable
- Sustainable long-term

## Treasury Allocation

Platform operations (20-30% depending on tier) funds:

**Operations** (40%):
- Server infrastructure
- Database management
- Key server operation
- Storage (Walrus)

**Development** (35%):
- Engineering team
- Feature development
- Security audits
- Technical research

**Community** (25%):
- Bounties and programs
- Partnerships
- Community events
- Education

Treasury is transparent and community-governed.

## Supply Target

SONAR targets an equilibrium at 50M SONAR:

- Not deflationary (would require massive burn)
- Not inflationary (would dilute holders)
- Provides yield (burn reduces supply)
- Sustainable forever

At 50M SONAR:
- 20% purchase burn = equilibrium
- Creator share 50% = fair
- Operations 30% = sufficient

This is the "happy medium" point.

## Comparison to Other Projects

| Project | Mechanism | Outcome |
|---------|-----------|---------|
| Traditional (fixed 20% burn) | Fixed burn regardless of supply | Death spiral when supply high |
| Deflationary (increasing burns) | Burn accelerates as supply shrinks | Hyperdeflationary, impractical |
| Inflationary (rewards only) | Unlimited supply growth | Hyperinflation, value collapse |
| **SONAR (adaptive)** | **Burns adjust to supply level** | **Sustainable equilibrium** |

## Long-Term Economics

### Year 1-2: Growth

- Supply: 1M to 10M
- Activity: Low to Medium
- Burn: 0-5%
- Creator share: 80-65%
- Outcome: Rapid growth encouraged

### Year 3-4: Maturation

- Supply: 10M to 40M
- Activity: Medium to High
- Burn: 10-15%
- Creator share: 65-60%
- Outcome: Healthy growth

### Year 5+: Equilibrium

- Supply: Oscillates around 50M
- Activity: High and stable
- Burn: 20% (roughly equals creation)
- Creator share: 50%
- Outcome: Sustainable forever

## Governance and Changes

Burn rates can be adjusted by:
- SONAR DAO governance votes
- Community consensus
- Quarterly review of metrics
- Emergency adjustments (rare)

Any changes require:
- 30-day notice
- Community discussion
- Voting period
- Implementation delay

This prevents arbitrary changes and surprises.

## Next Steps

- See creator rewards: [Quality-Based Rewards](rewards.md)
- Understand purchase splits: [Purchase Revenue Splits](purchase-splits.md)
- Learn token overview: [Token Overview](README.md)
