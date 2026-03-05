# wet-router

open-source fee-to-LP automation for pump.fun tokens.

claims creator fees → swaps → routes liquidity across multiple DEXes. no protocol tax. no middleman. no fee.

## supported targets

| target | pool type | SDK |
|--------|-----------|-----|
| **pumpswap** | constant-product AMM (canonical pool) | `@pump-fun/pump-swap-sdk` |
| **meteora** | DLMM (concentrated liquidity) | `@meteora-ag/dlmm` |
| **raydium** | CLMM (concentrated liquidity) | `@raydium-io/raydium-sdk-v2` |
| **orca** | Whirlpool (concentrated liquidity) | `@orca-so/whirlpools-sdk` |

you can route to a single target, split across multiple, or route to all.

## how it works

```
bonding curve phase (pre-graduation):
  → fees accumulate in creator vault
  → no LP pool exists yet — wet-router waits

after graduation (~$30-35K mcap):
  → pump.fun creates PumpSwap AMM pool
  → wet-router activates:

  poll loop (every POLL_INTERVAL seconds)
    │
    ├─ check creator vault balance
    │   └─ uses @pump-fun/pump-swap-sdk to read vault PDA
    │
    ├─ if balance >= CLAIM_THRESHOLD
    │   └─ claim creator fees → SOL lands in wallet
    │
    ├─ swap half to tokens via Jupiter
    │
    └─ route SOL + tokens to configured LP targets
        ├─ pumpswap: deposit to canonical pool (SDK handles both sides)
        ├─ meteora: open DLMM position ±15 bins around active price
        ├─ raydium: open CLMM position ±20 ticks around current price
        └─ orca: open Whirlpool position ±20 ticks around current price
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

## configuration

```bash
# required
PRIVATE_KEY=           # wallet private key (base58)
RPC_URL=               # helius or other solana RPC
TOKEN_MINT=            # your token's mint address

# LP routing (default: pumpswap only)
LP_TARGETS=pumpswap                          # single target
LP_TARGETS=pumpswap:60,meteora:40            # split
LP_TARGETS=pumpswap:40,meteora:30,raydium:20,orca:10  # multi
LP_TARGETS=all                               # equal split across configured pools

# pool addresses (required for each non-pumpswap target)
METEORA_POOL=          # meteora DLMM pool address
RAYDIUM_POOL=          # raydium CLMM pool address
ORCA_POOL=             # orca whirlpool address
PUMPSWAP_POOL=         # optional — auto-derived from TOKEN_MINT

# tuning
CLAIM_THRESHOLD=0.05   # min SOL to trigger claim
POLL_INTERVAL=120      # seconds between checks
SLIPPAGE_BPS=200       # jupiter swap slippage (basis points)
SLIPPAGE_PCT=2         # LP deposit slippage (percent)

# optional
JUPITER_API_KEY=       # from portal.jup.ag (free tier works)
```

## examples

### basic: all fees → PumpSwap canonical pool
```bash
LP_TARGETS=pumpswap
# that's it. pool address auto-derived from TOKEN_MINT.
```

### split: 60% PumpSwap, 40% Meteora
```bash
LP_TARGETS=pumpswap:60,meteora:40
METEORA_POOL=ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq
```

### four-way split
```bash
LP_TARGETS=pumpswap:40,meteora:30,raydium:20,orca:10
METEORA_POOL=...
RAYDIUM_POOL=...
ORCA_POOL=...
```

## vs competitors

| | wet-router | bedrock | other protocols |
|---|---|---|---|
| fee | **0%** | 20% (10% rev + 10% eco) | 5-20% |
| code | open source | closed | varies |
| targets | pumpswap, meteora, raydium, orca | their own pools | single |
| self-host | yes | no | no |
| trust model | trustless (revoke admin) | trust bedrock | trust protocol |

## architecture

```
src/
├── config.ts          # env loading, LP target parsing
├── fees.ts            # creator vault balance + claim via pump SDK
├── swap.ts            # SOL → token via Jupiter v1
├── liquidity.ts       # multi-target router
├── targets/
│   ├── pumpswap.ts    # PumpSwap AMM deposit (official SDK)
│   ├── meteora.ts     # Meteora DLMM position (official SDK)
│   ├── raydium.ts     # Raydium CLMM position (official SDK)
│   └── orca.ts        # Orca Whirlpool position (official SDK)
└── index.ts           # main loop + orchestration
```

## security

- use a dedicated wallet — don't use your main
- `.env` is in `.gitignore` by default
- test with tiny amounts first (`CLAIM_THRESHOLD=0.01`)
- the bot only signs claim + swap + LP transactions
- all code is open — read it before running

## license

MIT. do whatever you want with it.
