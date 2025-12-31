# MP-06: Behavioral Pressure & Anti-Entropy Controls Specification

## Overview

MP-06 establishes a comprehensive economic framework for preventing spam, encouraging thoughtful participation, and creating deflationary pressure through value-backed assertions. This protocol replaces traditional computational proof-of-work with **semantic proof-of-commitment**, where all submissions require destroying value to assert intent.

**Core Philosophy**: The system does not ask "Can you pay?" but rather "Is this intent worth destroying value to assert?"

## Motivation

Traditional blockchain systems use computational proof-of-work to prevent spam. NatLangChain uses **economic proof-of-commitment** through permanent token burns, creating:
- Psychological friction against low-effort submissions
- Deflationary pressure improving token value over time
- Self-regulating quality through market forces
- Fair access through daily free allowances

## Protocol Components

### 1. Intent Filing Fee (Base Burn)

**Category**: Anti-Spam / Value Sink

Every intent or contract submission incurs a base burn fee, permanently removing tokens from circulation.

**Mechanics**:
- Flat burn amount per submission: `BASE_FILING_BURN` (default: 0.1 NLC)
- Burned tokens are unrecoverable and removed from total supply
- Applies to all non-free submissions
- Creates minimum seriousness threshold

**Purpose**:
- Establishes floor price for attention
- Converts spam into value destruction
- Creates psychological pause before posting
- Acts as constant deflationary "gravity"

### 2. Daily Free Submission Allowance

**Category**: Fairness / Accessibility

Each identity receives one free intent submission per rolling 24-hour period.

**Mechanics**:
- Reset interval: Rolling 24 hours per identity
- Free submissions bypass all burn fees
- Allowance is non-transferable and non-stackable
- Resets at first submission time + 24 hours

**Purpose**:
- Preserves accessibility for casual and new users
- Prevents paywall perception
- Establishes legitimacy anchor
- Encourages thoughtful daily participation

**Implementation**:
```typescript
interface DailyAllowance {
  identity: string;
  lastFreeSubmission: number; // Timestamp
  freeSubmissionsRemaining: number; // 0 or 1
  resetAt: number; // lastFreeSubmission + 24h
}
```

### 3. Per-User Exponential Burn Escalation

**Category**: Quality Enforcement
**Name**: Cognitive Compression Pressure

After the daily free submission, each additional submission incurs exponentially increasing burns.

**Burn Schedule** (illustrative, configurable):

| Submission # (Daily) | Burn Multiplier | Example Cost (Base = 0.1 NLC) |
|---------------------|-----------------|-------------------------------|
| 1st                 | Free (0×)       | 0 NLC                         |
| 2nd                 | Base × 1        | 0.1 NLC                       |
| 3rd                 | Base × 2        | 0.2 NLC                       |
| 4th                 | Base × 4        | 0.4 NLC                       |
| 5th                 | Base × 8        | 0.8 NLC                       |
| 6th                 | Base × 16       | 1.6 NLC                       |
| 7th+                | Base × 32       | 3.2 NLC                       |

**Formula**:
```
burnAmount = BASE_FILING_BURN × 2^(submissionCount - 2)  // for count >= 2
```

**Purpose**:
- Strongly discourages spam and compulsive posting
- Encourages intent bundling and consolidation
- Improves average semantic density
- Self-throttles high-frequency submitters

**Reset**: Counter resets 24 hours after first submission

### 4. Load-Scaled Network Pressure

**Category**: Immune System Response
**Name**: Adaptive Congestion Burn

During high network load, burn multiplier increases proportionally to protect against spam attacks.

**Mechanics**:
```
loadMultiplier = 1.0 + (currentLoad / maxLoad) × LOAD_PRESSURE_FACTOR
totalBurn = baseBurn × escalationMultiplier × loadMultiplier
```

**Load Metrics**:
- Submissions per minute across network
- Pending alignment queue depth
- Mediator node capacity utilization

**Configuration**:
- `MAX_NETWORK_LOAD`: Threshold for maximum pressure (default: 1000 submissions/min)
- `LOAD_PRESSURE_FACTOR`: Maximum multiplier at capacity (default: 5.0)
- `LOAD_MEASUREMENT_WINDOW`: Rolling window for load calculation (default: 5 minutes)

**Purpose**:
- Protects network during spam attacks
- Distributes capacity fairly via price mechanism
- Self-regulates without hard rate limits
- Economically penalizes attackers

### 5. Success Burn (Alignment Fee)

**Category**: Value Flywheel
**Name**: Productive Deflationary Pressure

When alignments successfully close, additional burns proportional to settlement value create ongoing deflation.

**Mechanics**:
```
successBurn = settlementValue × SUCCESS_BURN_RATE
```

**Configuration**:
- `SUCCESS_BURN_RATE`: Percentage of settlement value (default: 0.5% = 0.005)
- Applied to total settlement value at closure
- Separate from facilitation fees paid to mediator

**Purpose**:
- Creates permanent value sink from network productivity
- Aligns token economics with network utility
- Rewards token holders through supply reduction
- Increases burn rate as network succeeds

**Example**:
- Settlement value: 10,000 NLC
- Success burn (0.5%): 50 NLC permanently destroyed
- Facilitation fee (1%): 100 NLC to mediator

### 6. Value-Weighted Priority Queue

**Category**: Economic Sorting
**Name**: Attention Market

Higher burns grant priority in mediator attention queues.

**Mechanics**:
```
priorityScore = burnAmount × urgencyMultiplier × reputationBonus
```

**Urgency Multiplier**:
- Users can optionally burn extra for faster processing
- Voluntary premium burns: 2×, 5×, 10× base amount
- Creates auction mechanism for urgent needs

**Purpose**:
- Market-driven priority without hard limits
- Enables urgent transactions to jump queue
- Additional revenue mechanism for mediators
- Self-regulating capacity allocation

## Configuration Parameters

```typescript
interface MP06Config {
  // Base burn
  baseFilingBurn: number;              // Default: 0.1 NLC

  // Daily allowance
  dailyFreeSubmissions: number;         // Default: 1
  allowanceResetHours: number;          // Default: 24

  // Exponential escalation
  enableEscalation: boolean;            // Default: true
  escalationBase: number;               // Default: 2 (2^n)
  maxEscalationMultiplier: number;      // Default: 32

  // Load pressure
  enableLoadPressure: boolean;          // Default: true
  maxNetworkLoad: number;               // Default: 1000 submissions/min
  loadPressureFactor: number;           // Default: 5.0
  loadMeasurementWindowMinutes: number; // Default: 5

  // Success burn
  enableSuccessBurn: boolean;           // Default: true
  successBurnRate: number;              // Default: 0.005 (0.5%)

  // Priority queue
  enablePriorityQueue: boolean;         // Default: false
  allowVoluntaryPremium: boolean;       // Default: false
  premiumMultipliers: number[];         // Default: [2, 5, 10]
}
```

## Economic Analysis

### Spam Economics

**Attacker Cost** (per intent):
- Minimum: BASE_FILING_BURN (0.1 NLC)
- With escalation (10 intents): 0 + 0.1 + 0.2 + 0.4 + 0.8 + 1.6 + 3.2 + 3.2 + 3.2 + 3.2 = **16.7 NLC**
- With load pressure (2× during attack): **33.4 NLC**

**Legitimate User Cost** (per day):
- Typical: 1 free + occasional paid = **~0.1 NLC/day**
- Heavy user (5 intents/day): 0 + 0.1 + 0.2 + 0.4 + 0.8 = **1.5 NLC/day**

**Ratio**: Spam is 22× more expensive than legitimate use

### Deflationary Impact

**Burn Sources**:
1. Filing fees: Constant small burns
2. Success burns: Proportional to network productivity
3. Load pressure: Episodic large burns during spam

**Long-term Effect**:
- Successful network → higher settlement volumes → more success burns
- Token becomes progressively scarcer
- Rising token value → increased spam cost → self-reinforcing protection

## Integration Points

### With Existing Systems

**BurnManager** (already exists):
- Extend with escalation calculation
- Add load pressure monitoring
- Implement success burn triggers

**IntentIngester**:
- Check daily allowance before ingestion
- Calculate total burn amount
- Submit burn transaction to chain
- Block submission if burn fails

**SettlementManager**:
- Trigger success burn on closure
- Calculate burn from settlement value
- Record burn in settlement metadata

**LoadMonitor** (already exists):
- Provide current load metrics
- Calculate load multiplier
- Expose metrics to burn calculator

## Implementation Phases

### Phase 1: Core Burn Infrastructure (Week 1)
- Extend BurnManager with escalation
- Implement DailyAllowanceTracker
- Add burn amount calculation
- Create burn verification

### Phase 2: Exponential Escalation (Week 1-2)
- Implement BurnEscalationManager
- Track per-user daily submission counts
- Calculate exponential multipliers
- Integrate with IntentIngester

### Phase 3: Load Pressure (Week 2)
- Implement LoadPressureCalculator
- Monitor network submission rate
- Calculate dynamic multipliers
- Apply to burn calculations

### Phase 4: Success Burns (Week 2-3)
- Implement SuccessBurnManager
- Hook into settlement closure
- Calculate and execute success burns
- Record in settlement metadata

### Phase 5: Priority Queue (Week 3-4)
- Implement PriorityQueueManager
- Sort intents by burn amount
- Allow voluntary premium burns
- Integrate with mediator selection

### Phase 6: Testing & Integration (Week 4)
- Comprehensive unit tests
- Integration tests
- Load testing with simulated attacks
- Economic simulation validation

## Security Considerations

1. **Burn Verification**: All burns must be cryptographically verified
2. **Allowance Manipulation**: Daily allowances tied to cryptographic identity
3. **Load Calculation**: Load metrics must be tamper-resistant
4. **Success Burn Timing**: Must occur before fee distribution to prevent gaming
5. **Priority Queue**: Prevent front-running attacks on priority burns

## Backwards Compatibility

- MP-06 is additive; existing systems continue to work
- Burn fees can be disabled via configuration
- Daily allowance defaults to sufficient free usage
- Gradual rollout possible with escalation disabled initially

## Success Metrics

1. **Spam Reduction**: Measure submission quality via semantic density
2. **Token Deflation**: Track total supply reduction over time
3. **User Accessibility**: Monitor daily free submission usage
4. **Attack Resilience**: Measure cost to sustained spam attack
5. **Economic Health**: Track burn/fee ratio and token value

## References

- **Burn Economics**: Token burn mechanisms and deflationary tokenomics
- **Rate Limiting**: Economic vs. computational spam prevention
- **Proof-of-Burn**: Cryptocurrency burning as proof mechanism
- **Attention Markets**: Priority queues and auction mechanisms
