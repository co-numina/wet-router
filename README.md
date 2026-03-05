# wet-router 💧

**Free fee-to-LP automation. No protocol. No fee. No middleman.**

Protocols charge 10% to claim your creator fees and add them to LP. That's three clicks on Raydium. wet-router does it for free — open source, runs on your machine, you control everything.

## What it does

1. **Monitors** your creator fee balance on Meteora/Raydium
2. **Claims** fees when they exceed your threshold
3. **Swaps** half to tokens via Jupiter (best route)
4. **Adds** both sides to your LP position
5. **Repeats** — every cycle, your pool gets deeper

## Quick Start

```bash
# Clone
git clone https://github.com/co-numina/wet-router
cd wet-router

# Configure
cp .env.example .env
nano .env  # add your wallet key + pool address

# Run
npm install
npm start
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PRIVATE_KEY` | Your wallet private key (base58) | required |
| `RPC_URL` | Helius or other Solana RPC | required |
| `TOKEN_MINT` | Your token's mint address | required |
| `POOL_ADDRESS` | Meteora/Raydium pool address | required |
| `POOL_TYPE` | `meteora` or `raydium` | `meteora` |
| `CLAIM_THRESHOLD` | Min SOL to trigger claim | `0.1` |
| `POLL_INTERVAL` | Seconds between checks | `60` |
| `LP_PERCENTAGE` | % of fees routed to LP | `100` |
| `SLIPPAGE_BPS` | Jupiter swap slippage (bps) | `100` |

## How it works

```
Trade Volume → Creator Fees accumulate
                    ↓
         wet-router monitors balance
                    ↓
         Threshold hit → auto-claim
                    ↓
         Split: 50% SOL / 50% → Jupiter swap to token
                    ↓
         Both sides → add to LP position
                    ↓
         Pool deeper. Slippage lower. Floor stronger.
```

## vs "Utility Protocols"

| | Them | wet-router |
|---|---|---|
| Source | Closed | Open — read every line |
| Fee | 10% of your fees | 0% forever |
| Control | They hold your keys | Runs on your machine |
| Trust | Trust their contract | Trust yourself |

## Important Notes

- **This sends real transactions.** Test with small amounts first.
- **Keep your private key safe.** Never share your `.env` file.
- **RPC matters.** Use Helius or Triton for reliability. Free RPCs will rate-limit.
- The discriminators and account layouts are based on current Meteora DLMM / Raydium CLMM versions. If programs update, offsets may change.

## $WET

$WET is the first token running wet-router live. Every fee claimed, every LP injection — tracked and verifiable on-chain at [wet-coin.vercel.app](https://wet-coin.vercel.app).

$WET isn't a product. It's proof that you don't need to pay rent on your own liquidity.

## License

MIT — do whatever you want with it.
