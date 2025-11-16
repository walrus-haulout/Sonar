# Step 5: Publishing

Publishing registers your verified dataset on the Sui blockchain. This is the final step that makes your audio available to buyers and updates your leaderboard position.

## What Publishing Does

Publishing is a blockchain transaction that:

1. **Records Ownership**: Blockchain records that you own this dataset
2. **Stores Metadata**: Title, description, tags are recorded
3. **Links Encrypted Audio**: Encrypted blob ID is registered
4. **Establishes Access Policy**: Who can decrypt is defined
5. **Awards Initial Points**: You earn points redeemable for future SNR airdrop
6. **Activates Monetization**: Buyers can now purchase
7. **Updates Leaderboard**: Your points and rank update

Once published, your dataset is permanent and immutable. You cannot delete or edit it.

## Before Publishing

Review everything one final time:

**Verification Results**:
- Status: "Passed"
- Quality score shown
- Rarity score (preliminary estimate)
- No safety or copyright flags

**Metadata**:
- Title is accurate and specific
- Description is detailed
- Languages are correct
- Tags are appropriate

**Audio Details**:
- File size confirmed
- Duration correct
- Format acceptable

**Agreement**:
- I own or have rights to this audio
- Content is original and not copyrighted
- Content complies with safety guidelines
- I accept publishing terms

If anything is wrong, go back and edit metadata or upload different audio. Once published, you cannot change it.

## The Publishing Transaction

### What You Sign

When you click "Publish", you will be prompted to sign a blockchain transaction in your wallet. The transaction includes:

**Dataset Information**:
- Your wallet address (proves ownership)
- Title and description
- Language tags
- Audio metadata (duration, sample rate, format)
- Timestamp (proves when you published)

**Encrypted References**:
- Walrus blob ID (location of encrypted audio)
- SEAL capsules (encrypted key shares)
- Policy ID (who can decrypt)

**Reward Information**:
- Initial token allocation
- Vesting schedule (90 days)
- Quality bonus tier
- Rarity multiplier (preliminary)

**Marketplace Settings**:
- Purchase price (you set or default applied)
- Revenue split (standard: 60% to you, 40% to platform)
- Availability (immediately active)

### Transaction Fees

Each publishing transaction costs:

**Base Fee**: ~0.001 SNR (varies with network conditions)
**Submission Fee**: 0.001% of circulating SNR supply (burned, prevents spam)
**Network Fee**: Minimal (typically under 0.001 SNR)

Total cost is usually under 0.002 SNR, charged from your wallet.

### Signing the Transaction

1. Click "Publish to Blockchain"
2. Your wallet opens (or notification appears)
3. Review transaction details
4. Confirm amount being charged
5. Click "Approve" or "Confirm"
6. Sign the transaction with your private key
7. Wait for blockchain confirmation (10-30 seconds)

### Security Notes

- You are signing, not giving SONAR access to your wallet
- SONAR cannot move your points or tokens without your signature
- No private keys are shared
- Transaction is verified by Sui blockchain consensus
- Timestamp is cryptographically secure

## During Publishing

### Progress Indicator

You will see:
- "Submitting transaction..."
- "Waiting for blockchain confirmation..."
- "Finalizing publication..."

This typically takes 10-30 seconds.

### Do Not Close

While publishing:
- Keep the page open
- Do not close your browser
- Do not disconnect your wallet
- Do not go offline
- Wait for "Success" confirmation

Closing during this process may leave your transaction in pending state.

## After Publishing

### Immediate (Within 30 seconds)

Your dataset appears in:
- Your profile (under "My Submissions")
- Blockchain explorer (search your wallet address)
- Your submission history

Buyers cannot see or purchase yet, but blockchain confirms ownership.

### Within 5 Minutes

Your dataset appears in:
- Marketplace search results
- Marketplace browse view
- Global dataset listings

Buyers can now see and preview your audio (first 30 seconds).

### Within 1 Hour

Your leaderboard position updates:
- Points are calculated
- Tier progresses (if applicable)
- Achievements unlock (if qualified)
- Leaderboard refresh shows your new rank

You can monitor your points in your profile.

### Over 1 Week

System optimizations complete:
- Similar submissions are identified
- Saturation levels calculated
- Rarity score finalized (may change from preliminary estimate)
- Leaderboard ranking stabilizes

Your final rarity score and points may differ slightly from the preliminary estimate shown at publication. This is normal as the system gathers more context.

## What Happens to Your Audio

### Encrypted Storage

Your encrypted audio:
- Is stored on Walrus (decentralized)
- Remains encrypted at all times
- Cannot be decrypted without authorization
- Will remain available indefinitely
- Cannot be deleted or modified by SONAR

### Your Plaintext

- Is permanently deleted from SONAR systems
- Remains only on your computer (if you kept backup)
- Is not stored, backed up, or logged anywhere
- Cannot be recovered by SONAR even if requested

Your audio is your responsibility to backup if you want to keep your own copy.

### Access Control

Only people who:
- Purchase your dataset, OR
- You explicitly authorize, OR
- Have valid SessionKey with blockchain approval

Can decrypt and access your audio. No one else can.

## Points & Token Rewards

### Initial Allocation

When you publish, you earn initial points based on:
- **Rarity Score** (0-100): How unique is the audio?
- **Quality Score** (0-1): Technical audio quality
- **Specificity Grade** (A-F): How detailed and specific?
- **Verification Status**: Were claims verified?
- **Early Contributor Bonus**: Are you among early creators?
- **Bulk Bonus**: Did you submit 100+ samples?

Points earned are redeemable for SNR tokens in the future airdrop. Higher quality and rarity submissions earn more points.

### Point Vesting & Token Redemption

Your points vest over 90 days:

**Day 1**: Tokens allocated (locked)
**Day 30**: ~33% unlocked and claimable
**Day 60**: ~67% unlocked and claimable
**Day 90**: 100% unlocked and claimable

You can claim tokens as they unlock, or wait for 90 days and claim all at once.

### Purchase Revenue

In addition to initial allocation, you receive ongoing revenue when buyers purchase your dataset:

- 60% of purchase price goes to you (vested over 30 days)
- 20% is burned (removed from circulation)
- 20% goes to platform operations

Revenue splits may vary based on current token economics, but your split is always favorable to creators.

## Your Leaderboard Position

### How Ranking Works

Your rank on the global leaderboard is determined by:
1. **Total Points**: All-time points from all datasets
2. **Tier**: Current achievement tier (Contributor to Legend)
3. **Submissions**: Number of published datasets
4. **Average Rarity Score**: Average quality of your submissions
5. **Achievements**: Unlocked badges

Higher points = higher rank. Rank updates within 1 hour of publishing.

### Tier Progression

As you accumulate points, you advance tiers:
- **0-999**: Contributor
- **1,000-4,999**: Bronze
- **5,000-9,999**: Silver
- **10,000-24,999**: Gold
- **25,000-49,999**: Platinum
- **50,000-99,999**: Diamond
- **100,000+**: Legend

Each tier unlocks new achievements and increases your airdrop eligibility.

### Leaderboard Updates

- Real-time: Points update immediately
- Hourly: Ranking positions recalculate
- Daily: Snapshot preserved for history
- Weekly: Trends and statistics updated

You can track your progress in your profile.

## Achievements

After publishing, the system automatically checks if you have unlocked any achievements:

**Milestone Achievements**:
- First Blood: Published first dataset
- Content Creator: 10+ submissions
- Prolific Creator: 50+ submissions

**Rarity Achievements**:
- Rare Hunter I: 10+ high/critical rarity submissions
- Bulk Pioneer: First bulk (100+) submission

**Quality Achievements**:
- Quality Master: Average rarity score 80+
- Perfectionist: 5+ Grade A specificity submissions

**Tier Achievements**:
- Bronze Hands: Reached Bronze tier
- Silver Hands: Reached Silver tier
- Gold Hands: Reached Gold tier
- Diamond Hands: Reached Diamond tier
- Legend Status: Reached Legend tier

Achievements are unlocked automatically and visible in your profile.

## What Buyers See

When buyers browse your dataset:

**Public Information**:
- Your username/wallet address
- Title and full description
- Tags and metadata
- Quality score (0-100)
- Rarity score (0-100)
- Audio preview (first 30 seconds, low quality)
- Number of times purchased
- Review score (if available)
- Your tier and rank

**Hidden Until Purchase**:
- Full-quality audio
- Full-length audio
- Technical metadata
- Verification details

This ensures buyers know what they are purchasing before buying.

## Monitoring Your Dataset

### View Performance

In your dashboard, see:
- Downloads/purchases count
- Revenue earned
- Days since publication
- Leaderboard position
- Similar submissions count
- Saturation status

### Keyword Rankings

Track how your dataset ranks for specific searches:
- Search for your title
- Check your position
- See competing datasets
- Understand your market position

### Sales History

View:
- Purchase dates
- Buyer counts
- Revenue over time
- Payment schedule

## FAQ

**Q: Can I change my title or description after publishing?**
No, they are permanent. This ensures buyers trust what they purchased matches what was listed.

**Q: What if I made a mistake in my metadata?**
You cannot edit. You must unpublish (if available) and re-upload with correct metadata. This costs additional fees, so review carefully.

**Q: When do I receive my tokens?**
Initial allocation is locked immediately. Vesting unlocks over 90 days. Purchase revenue vests over 30 days.

**Q: How much can I earn per submission?**
Depends entirely on rarity, quality, and buyer demand. Higher quality and rarer datasets earn more points.

**Q: Will buyers see my wallet address?**
Yes, your wallet address is public on the blockchain. You cannot hide your identity.

**Q: Can I remove my dataset from the marketplace?**
No, once published, it is permanent. You cannot delete or unpublish.

**Q: How do buyers find my audio?**
Via search (title, description, tags), browsing categories, leaderboard, recommendations, and direct links you share.

**Q: Will my audio be stolen or copied?**
Walrus stores only encrypted blobs. Buyers receive decrypted audio, but the blockchain watermarks all purchases with your creator ID. Copyright of creation is proven on-chain.

## Next Steps

### Monitor Your Progress

- Check your profile daily
- Watch leaderboard updates
- Monitor achievements
- Track earnings

### Upload More

- Diversify your submissions (different subjects)
- Target rare subjects (higher multipliers)
- Bulk submissions (100+ samples = 2x bonus)
- Maintain consistency (new uploads regularly)

### Check Results

- [Rarity System Details](../rarity-system/README.md)
- [Leaderboard Guide](../rarity-system/leaderboard.md)
- [Airdrop Eligibility](../rarity-system/airdrop.md)

### Monetize Further

- Sell directly: Buyers purchase full access
- Earn tokens: Leaderboard rewards and airdrops
- Build reputation: Higher tier = more recognition

Congratulations on publishing your first dataset. You are now a SONAR creator!
