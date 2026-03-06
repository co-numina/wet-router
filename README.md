<p align="center">
  <h1 align="center">💧 wet-router</h1>
  <p align="center">
    open-source fee-to-LP automation for pump.fun tokens
    <br />
    claims creator fees → swaps → routes liquidity across every major solana DEX
    <br />
    no protocol tax. no middleman. no fee. ever.
  </p>
</p>

<p align="center">
  <a href="#quick-start">quick start</a> •
  <a href="#how-it-works">how it works</a> •
  <a href="#configuration">configuration</a> •
  <a href="#supported-dexes">supported DEXes</a> •
  <a href="#vs-competitors">vs competitors</a> •
  <a href="https://wet-coin.vercel.app">website</a>
</p>

---

## why

pump.fun graduated tokens generate creator fees. most people either:
- leave them unclaimed (wasted value)
- claim and sell (dumps price)
- use bedrock and pay 20% for the privilege

wet-router does the right thing: claims fees, swaps half to tokens, deposits both sides as LP — automatically, trustlessly, for free.

your fees become permanent liquidity. deeper pools. tighter spreads. better price action. the token wins, holders win, you win.

## supported DEXes

| target | pool type | SDK | status |
|--------|-----------|-----|--------|
| **PumpSwap** | constant-product AMM | `@pump-fun/pump-swap-sdk` | ✅ ready |
| **Meteora** | DLMM (concentrated liquidity) | `@meteora-ag/dlmm` | ✅ ready |
| **Raydium** | CLMM (concentrated liquidity) | `@raydium-io/raydium-sdk-v2` | ✅ ready |
| **Orca** | Whirlpool (concentrated liquidity) | `@orca-so/whirlpools-sdk` | ✅ ready |

route to one, split across many, or `all` for equal distribution.

## how it works

```
┌─────────────────────────────────────────────────────────┐
│                    BONDING CURVE PHASE                   │
│  fees accumulate in creator vault · no pool exists yet   │
│  wet-router monitors and waits for graduation            │
└──────────────────────────┬──────────────────────────────┘
                           │ graduation (~$30-35K mcap)
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   WET-ROUTER ACTIVATES                   │
│                                                          │
│  every POLL_INTERVAL seconds:                            │
│                                                          │
│  ┌─────────────────┐                                     │
│  │ check vault bal  │──── below threshold? → skip        │
│  └────────┬────────┘                                     │
│           │ ≥ CLAIM_THRESHOLD                            │
│           ▼                                              │
│  ┌─────────────────┐                                     │
│  │  claim fees      │ pump.fun SDK → SOL in wallet       │
│  └────────┬────────┘                                     │
│           ▼                                              │
│  ┌─────────────────┐                                     │
│  │  swap 50% → tok  │ Jupiter v1 aggregator              │
│  └────────┬────────┘                                     │
│           ▼                                              │
│  ┌─────────────────────────────────────────────┐         │
│  │          route to LP targets                 │         │
│  │                                              │         │
│  │  pumpswap ──→ deposit to canonical AMM pool  │         │
│  │  meteora  ──→ DLMM position ±15 bins         │         │
│  │  raydium  ──→ CLMM position ±20 ticks        │         │
│  │  orca     ──→ Whirlpool position ±20 ticks   │         │
│  └──────────────────────────────────────────────┘         │
│                                                          │
│  rinse and repeat ♻️                                      │
└─────────────────────────────────────────────────────────┘
```

## quick start

```bash
git clone https://github.com/co-numina/wet-router
cd wet-router
cp .env.example .env
# edit .env with your config
npm install
npm start
```

that's it. the router will poll your creator vault and start routing fees as soon as the token graduates.

### dry run mode

test your config without signing any transactions:

```bash
npm run dev
# or
DRY_RUN=true npm start
```

logs everything it *would* do — vault checks, swap quotes, LP deposit params — without touching the chain.

## configuration

### required

```bash
PRIVATE_KEY=           # wallet private key (base58)
RPC_URL=               # helius or other solana RPC
TOKEN_MINT=            # your token's mint address
```

### LP routing

```bash
# single target (default)
LP_TARGETS=pumpswap

# split between two
LP_TARGETS=pumpswap:60,meteora:40

# multi-target
LP_TARGETS=pumpswap:40,meteora:30,raydium:20,orca:10

# equal split across all configured pools
LP_TARGETS=all
```

### pool addresses

```bash
# required for each non-pumpswap target
METEORA_POOL=          # meteora DLMM pool address
RAYDIUM_POOL=          # raydium CLMM pool address
ORCA_POOL=             # orca whirlpool address

# optional — auto-derived from TOKEN_MINT if not set
PUMPSWAP_POOL=
```

### tuning

```bash
CLAIM_THRESHOLD=0.05   # min SOL to trigger claim (default: 0.05)
POLL_INTERVAL=120      # seconds between checks (default: 120)
SLIPPAGE_BPS=200       # jupiter swap slippage in basis points (default: 200)
SLIPPAGE_PCT=2         # LP deposit slippage percent (default: 2)
```

### optional

```bash
JUPITER_API_KEY=       # from portal.jup.ag (free tier works)
DRY_RUN=true           # log actions without signing transactions
```

## examples

### basic: all fees → PumpSwap canonical pool

```bash
LP_TARGETS=pumpswap
# pool address auto-derived from TOKEN_MINT. zero config.
```

### 60/40 split: PumpSwap + Meteora

```bash
LP_TARGETS=pumpswap:60,meteora:40
METEORA_POOL=ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq
```

### four-way distribution

```bash
LP_TARGETS=pumpswap:40,meteora:30,raydium:20,orca:10
METEORA_POOL=...
RAYDIUM_POOL=...
ORCA_POOL=...
```

### high-frequency claiming

```bash
CLAIM_THRESHOLD=0.01   # claim at 0.01 SOL
POLL_INTERVAL=30       # check every 30 seconds
```

## vs competitors

| | **wet-router** | bedrock | other protocols |
|---|---|---|---|
| **fee** | **0% forever** | 20% (10% rev + 10% eco) | 5-20% |
| **code** | fully open source | closed source | varies |
| **LP targets** | pumpswap, meteora, raydium, orca | their own pools only | single DEX |
| **self-host** | yes — your machine, your keys | no — their infra | no |
| **trust model** | trustless (revoke fee admin after setup) | trust bedrock | trust protocol |
| **concentrated liquidity** | ✅ meteora DLMM, raydium CLMM, orca whirlpool | ❌ | ❌ |
| **multi-target routing** | ✅ split across any combo | ❌ | ❌ |
| **cost to use** | RPC costs only (~$0) | 20% of all fees | varies |

the math: on a token generating 10 SOL/day in creator fees, bedrock takes 2 SOL. wet-router takes 0. that's 60 SOL/month back in your pocket (or your LP).

## architecture

```
src/
├── config.ts              # env loading, LP target parsing, validation
├── fees.ts                # creator vault balance check + claim via pump SDK
├── swap.ts                # SOL → token swap via Jupiter v1 aggregator
├── liquidity.ts           # multi-target router + percentage splitting
├── targets/
│   ├── pumpswap.ts        # PumpSwap AMM deposit (official SDK)
│   ├── meteora.ts         # Meteora DLMM position ±15 bins (official SDK)
│   ├── raydium.ts         # Raydium CLMM position ±20 ticks (official SDK)
│   └── orca.ts            # Orca Whirlpool position ±20 ticks (official SDK)
├── test-dry.ts            # dry run test harness
└── index.ts               # main poll loop + orchestration
```

810 lines of TypeScript. no framework bloat. every dependency is an official SDK.

## on-chain verification

pump.fun's fee sharing program: `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ`

this is pump.fun's **native** fee sharing program — not bedrock's, not anyone else's. bedrock just builds a UI on top and takes 20%.

key PDAs:
- **sharing config:** `["sharing-config", mint_pubkey]` — per-token fee configuration
- **shareholder PDA:** `["social-fee-pda", sharing_config, recipient]` — individual recipient accounts

key instructions:
- `CreateFeeSharingConfig` — set up fee sharing for a token
- `UpdateFeeShares` — modify share percentages
- `ClaimSocialFeePda` — claim accumulated fees
- `RevokeFeeShareAuthority` — permanently lock configuration (trustless mode)

## security

- **use a dedicated wallet.** don't use your main. the private key lives in `.env` on your machine — never shared, never transmitted.
- `.env` is in `.gitignore` by default
- test with dry run mode first (`DRY_RUN=true`)
- test with tiny amounts second (`CLAIM_THRESHOLD=0.01`)
- the bot only signs three types of transactions: fee claims, Jupiter swaps, and LP deposits
- all code is open — read it before running. it's 810 lines.
- after setup, you can `RevokeFeeShareAuthority` to permanently lock the config on-chain. nobody (including you) can change fee routing after that.

## FAQ

**do I need to keep this running 24/7?**
no. it polls on a timer. run it when you want, stop it when you don't. fees accumulate in the vault regardless — nothing is lost.

**what happens if a transaction fails?**
the router logs the error and retries on the next poll cycle. fees stay in the vault until successfully claimed.

**can I change LP targets after starting?**
yes. stop the router, edit `.env`, restart. existing LP positions stay — new claims route to the updated targets.

**does this work with tokens that already graduated?**
yes. as long as you're the creator (or have fee share access), wet-router can claim and route.

**what's the minimum viable config?**
three env vars: `PRIVATE_KEY`, `RPC_URL`, `TOKEN_MINT`. defaults route 100% to PumpSwap.

**how much does it cost to run?**
zero. RPC calls are free on most providers. transaction fees are fractions of a cent. no subscription, no protocol fee, no rev share.

**what if I want to claim fees but NOT add LP?**
that's just claiming fees and selling. wet-router is specifically for fee → LP conversion. for raw claiming, use pump.fun's UI or the SDK directly.

## troubleshooting

| issue | cause | fix |
|-------|-------|-----|
| `vault balance: 0` | token hasn't graduated or no fees generated yet | wait for graduation + trading volume |
| `swap failed: slippage exceeded` | price moved during swap | increase `SLIPPAGE_BPS` (try 300-500) |
| `LP deposit failed` | pool doesn't exist or wrong address | verify pool address on the DEX UI |
| `RPC rate limited` | too many requests | increase `POLL_INTERVAL` or use a paid RPC |
| `insufficient balance` | wallet needs SOL for tx fees | fund wallet with ~0.01 SOL for gas |
| `pool not found for pumpswap` | token hasn't migrated to PumpSwap yet | wait — pool is created at graduation |

## roadmap

- [ ] mainnet battle testing (first live token)
- [ ] telegram bot notifications (claim events, LP deposits, errors)
- [ ] auto-rebalance concentrated liquidity positions
- [ ] multi-token support (one router, many tokens)
- [ ] hosted service option (zero setup, still 0% fee)
- [ ] web dashboard for monitoring LP health

## contributing

PRs welcome. the codebase is small and readable.

```bash
git clone https://github.com/co-numina/wet-router
cd wet-router
npm install
# make changes in src/
npm run build          # type-check
DRY_RUN=true npm start # test without signing
```

if you're adding a new DEX target, add a file in `src/targets/` following the existing pattern. each target exports a single `deposit()` function.

## license

MIT. do whatever you want with it.

---

<p align="center">
  built by <a href="https://github.com/co-numina">co-numina</a> · <a href="https://wet-coin.vercel.app">wet-coin.vercel.app</a>
</p>
