# User Leaderboard & Airdrop System Documentation

## Overview

The audio-verifier now includes a comprehensive user tracking system that gamifies audio submissions through:
- **Points System**: Dynamic point calculation based on rarity, quality, and contributions
- **Leaderboard**: Global rankings and user progression tracking
- **Achievements**: Badges for milestones and accomplishments
- **Airdrop Eligibility**: Fair allocation system based on quality and consistency

---

## Core Components

### 1. Database Schema (`migrations/001_add_user_tracking.sql`)

New tables added to PostgreSQL:
- **users**: User accounts and tier progression
- **user_submissions**: Tracks each submission with points breakdown
- **leaderboard_snapshot**: Daily ranking snapshots
- **airdrop_eligibility**: Airdrop allocation data
- **subject_rarity_cache**: Web research cache for subject rarity
- **user_achievements**: Unlocked badges and achievements
- **anti_abuse_flags**: Flags for suspicious patterns

### 2. User Management (`user_manager.py`)

**Class**: `UserManager`

Responsibilities:
- User CRUD operations
- Points accumulation
- Tier progression (Contributor → Legend)
- Rank calculation

**Key Methods**:
```python
get_or_create_user(wallet_address, username)
add_points(wallet_address, points, rarity_score, ...)
get_user_rank(wallet_address)
update_all_ranks()
get_leaderboard(limit, offset)
```

**Tier System**:
- Legend: 100,000+ points
- Diamond: 50,000-99,999
- Platinum: 25,000-49,999
- Gold: 10,000-24,999
- Silver: 5,000-9,999
- Bronze: 1,000-4,999
- Contributor: 0-999

### 3. Points Calculation (`points_calculator.py`)

**Class**: `PointsCalculator`

**Formula**:
```
points = rarity_score × quality_mult × bulk_mult × subject_mult ×
         specificity_mult × verification_mult × early_mult
```

**Multipliers**:

| Factor | Range | Notes |
|--------|-------|-------|
| Quality | 1.0-1.5x | Based on audio quality score |
| Bulk | 1.0-2.0x | First bulk (100+ samples) = 2.0x |
| Subject Rarity | 0.5-5.0x | Critical = 5.0x, Oversaturated = 0.5x |
| Specificity | 1.0-1.3x | Grade A = 1.3x, Grade F = 1.0x |
| Verification | 1.0-1.2x | Verified claims = 1.2x |
| Early Contributor | 1.0-1.5x | First 100 datasets = 1.5x |

**Example**:
- Rarity Score: 85
- Quality: Excellent (1.4x)
- First bulk of rare species (2.0x × 5.0x)
- Specificity Grade A (1.3x)
- All verified (1.2x)
- Early contributor (1.5x)
- **Total: 85 × 1.4 × 2.0 × 5.0 × 1.3 × 1.2 × 1.5 = 31,122 points**

### 4. Leaderboard Service (`leaderboard_service.py`)

**Class**: `LeaderboardService`

Responsibilities:
- Real-time leaderboard rankings
- Daily snapshots
- User history tracking
- Tier distribution analysis

**Key Methods**:
```python
get_global_leaderboard(limit, offset, tier)
get_user_rank_info(wallet_address)
create_snapshot()  # Daily snapshot
get_leaderboard_history(wallet_address, days)
search_users(query, limit)
```

### 5. Airdrop Calculator (`airdrop_calculator.py`)

**Class**: `AirdropCalculator`

**Eligibility Scoring**:
- Total Points: 50% weight
- Submission Diversity: 20% weight
- First Bulk Contributions: 15% weight
- Rare Subject Focus: 10% weight
- Consistency: 5% weight

**Allocation Method**:
```
allocation_percent = user_eligibility_score / total_all_eligible_scores × 100
```

**Key Methods**:
```python
calculate_eligibility(wallet_address)
calculate_all_eligibility()  # Batch calculation
get_airdrop_snapshot()
```

### 6. Achievements Tracker (`achievements_tracker.py`)

**Class**: `AchievementsTracker`

**20 Achievements**:
| Achievement | Icon | Requirement |
|-------------|------|-------------|
| First Blood | 🩸 | Submit 1 dataset |
| Bulk Pioneer | 🚀 | First 100+ bulk |
| Rare Hunter I | 🦅 | 10 rare datasets |
| Rare Hunter II | 🦉 | 50 rare datasets |
| Quality Master | ⭐ | Avg score > 80 |
| Quality Legend | ✨ | Avg score > 90 |
| Diamond Hands | 💎 | Diamond tier |
| Legend Status | 👑 | Legend tier |
| Early Adopter | 🌟 | Top 100 contributors |
| Diversity King | 🎨 | 20+ subjects |
| Perfectionist | 🎯 | 5 Grade A submissions |
| Bulk Master | 📦 | 5+ first bulk |
| Content Creator | 📝 | 10 submissions |
| Prolific Creator | 📚 | 50 submissions |
| Master Creator | 🏆 | 100 submissions |
| Point Collector | 💰 | 10k points |
| Point Magnate | 💵 | 50k points |
| Point Emperor | 👸 | 100k points |
| Verified Contributor | ✅ | 5 verified submissions |
| Consistent Contributor | 📅 | 30+ days of activity |

---

## Data Flow

### Submission → Points → Leaderboard

```
1. User submits audio
   ↓
2. Verification runs (stages 1-3)
   ↓
3. Stage 4: Gemini analyzes and scores
   ↓
4. Points Calculator processes:
   - Rarity score
   - Quality multiplier
   - Bulk contributor status
   - Subject rarity tier
   - Specificity grade
   - Verification status
   ↓
5. Points awarded to user
   ↓
6. User stats updated
   ↓
7. Rank recalculated
   ↓
8. Achievements checked
   ↓
9. Leaderboard updated
   ↓
10. User sees results:
    - Points earned
    - New total
    - Current rank
    - Tier status
    - Achievements unlocked
```

---

## Reward Dynamics

### Early Advantages

First contributors get bonuses:
- **First 100 datasets**: 1.5x multiplier
- **First bulk of rare subject**: 2.0x multiplier
- **Critical rarity species**: 5.0x multiplier

Example: First 100-sample submission of critically rare species could earn **100,000+ points**.

### Saturation Protection

Once category has 25+ samples:
- Generic entries score lower
- Specific variants still score high
- Encourages quality over quantity

### Fair Progression

- Grandfathered pricing: Early contributors keep high scores
- Dynamic thresholds: Rare subjects harder to saturate
- Consistency rewards: Regular contributions > one-time dump

---

## Anti-Gaming Measures

### Quality Gates

- Minimum quality score required for points
- Semantic similarity check against user's own submissions
- Manual review flag for suspicious patterns

### Rate Limiting

- Per-day submission limits
- Duplicate detection
- Saturation penalty for spam

### Verification Requirements

- Higher points require verified claims
- False claims flagged in anti_abuse_flags table
- Reputation impact

---

## Usage Examples

### Check User Points

```python
from user_manager import UserManager

manager = UserManager()
user = await manager.add_points(
    wallet_address="0x1234...",
    points=15000,
    rarity_score=85,
    sample_count=100,
    is_first_bulk=True,
    subject_rarity_tier="Critical"
)
print(f"User {user['wallet_address']} now has {user['total_points']} points")
```

### Get Global Leaderboard

```python
from leaderboard_service import LeaderboardService

service = LeaderboardService()
top_users = await service.get_global_leaderboard(limit=100)
for user in top_users:
    print(f"#{user['rank']}: {user['username']} - {user['total_points']} pts")
```

### Calculate Airdrop Eligibility

```python
from airdrop_calculator import AirdropCalculator

calc = AirdropCalculator()
eligibility = await calc.calculate_eligibility("0x1234...")
print(f"Score: {eligibility['eligibility_score']}")
print(f"Allocation: {eligibility['allocation_percentage']}%")
```

### Unlock Achievements

```python
from achievements_tracker import AchievementsTracker

tracker = AchievementsTracker()
unlocked = await tracker.check_and_unlock_achievements("0x1234...")
for achievement in unlocked:
    print(f"🎉 Unlocked: {achievement['name']}")
```

---

## Migration Instructions

### 1. Run Database Migration

```bash
cd audio-verifier
python migrations/migrate.py
```

This creates all new tables and indexes.

### 2. Initialize Services in Backend

```python
from user_manager import UserManager
from leaderboard_service import LeaderboardService
from points_calculator import PointsCalculator
from airdrop_calculator import AirdropCalculator
from achievements_tracker import AchievementsTracker

# Initialize all services
user_mgr = UserManager()
leaderboard = LeaderboardService()
points_calc = PointsCalculator()
airdrop_calc = AirdropCalculator()
achievements = AchievementsTracker()
```

### 3. Integrate into Verification Pipeline

Update `verification_pipeline.py` Stage 4 to:
1. Call `PointsCalculator.calculate_points()`
2. Call `UserManager.add_points()`
3. Check `AchievementsTracker.check_and_unlock_achievements()`
4. Update response with points/tier info

### 4. Setup Cron Jobs

Schedule:
- **Hourly**: Update all user ranks
- **Daily**: Create leaderboard snapshots
- **Weekly**: Recalculate airdrop eligibility
- **Monthly**: Archive old snapshots

---

## API Endpoints (To Be Implemented)

```
GET /api/leaderboard - Global rankings
GET /api/leaderboard/:wallet - User stats
GET /api/leaderboard/search?q=... - Search users
GET /api/user/:wallet/achievements - User badges
GET /api/user/:wallet/history?days=30 - History
GET /api/airdrop/eligibility - Current airdrop snapshot
POST /api/airdrop/calculate - Trigger eligibility calc
```

---

## Frontend Components (To Be Implemented)

- `Leaderboard.tsx` - Global rankings with filters
- `UserProfile.tsx` - Personal stats and history
- `PointsBreakdown.tsx` - Detailed points calculation
- `AirdropDashboard.tsx` - Eligibility visualization
- `Achievements.tsx` - Badge display and progress
- `TierProgress.tsx` - Progress to next tier bar

---

## Future Enhancements

1. **Seasonal Leaderboards**: Reset quarterly with bonus multipliers
2. **Team Competitions**: Collaborate for group rewards
3. **Achievement Rarity**: Some badges only available for top X%
4. **NFT Integration**: Mint achievement badges as NFTs
5. **Dynamic Multipliers**: Seasonal events boost specific audio types
6. **Referral System**: Bonus points for inviting contributors

---

## Support

For issues or questions about the leaderboard system, refer to:
- `points_calculator.py` for scoring details
- `user_manager.py` for tier thresholds
- `airdrop_calculator.py` for allocation logic
