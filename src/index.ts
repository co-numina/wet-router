import {
  connection, wallet, log,
  CLAIM_THRESHOLD, POLL_INTERVAL,
  TOKEN_MINT,
  parseLpTargets, LpTarget,
} from "./config";
import { loadHistory } from "./history";
import { getCreatorVaultBalance, claimCreatorFees } from "./fees";
import { swapSolForToken } from "./swap";
import { routeLiquidity, derivePumpPool } from "./liquidity";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

// ════════════════════════════════════════════════════
// wet-router v3 — multi-target fee-to-LP automation
// pumpswap · meteora · raydium · orca
// no protocol. no fee. no middleman.
// ════════════════════════════════════════════════════

let targets: LpTarget[];

async function printConfig() {
  const bal = await connection.getBalance(wallet.publicKey);
  const vaultBal = await getCreatorVaultBalance();
  const poolAddr = derivePumpPool();

  const targetStr = targets
    .map(t => `${t.type} ${t.percent}%${t.pool ? ` → ${t.pool.toBase58().slice(0, 12)}...` : " (auto)"}`)
    .join("\n                    ");

  console.log(`
╔══════════════════════════════════════════════════╗
║          wet-router v3.0.0                        ║
║   multi-target fee-to-LP automation               ║
║   pumpswap · meteora · raydium · orca             ║
║   no protocol. no fee. no middleman.              ║
╚══════════════════════════════════════════════════╝

  wallet:          ${wallet.publicKey.toBase58()}
  wallet balance:  ${(bal / LAMPORTS_PER_SOL).toFixed(4)} SOL
  token mint:      ${TOKEN_MINT.toBase58()}
  pump pool:       ${poolAddr.toBase58()}
  vault balance:   ${vaultBal.toFixed(4)} SOL (unclaimed fees)
  threshold:       ${CLAIM_THRESHOLD} SOL
  poll interval:   ${POLL_INTERVAL}s

  LP targets:      ${targetStr}
`);
}

/**
 * Main cycle:
 * 1. Claim creator fees from pump AMM vault → wallet
 * 2. Check wallet balance
 * 3. Swap half to tokens via Jupiter
 * 4. Route SOL + tokens across configured LP targets
 */
async function cycle() {
  try {
    // Step 1: Check vault and claim if there are fees
    const vaultBalance = await getCreatorVaultBalance();

    if (vaultBalance > 0.001) {
      log(`→ creator vault has ${vaultBalance.toFixed(4)} SOL — claiming...`);
      await claimCreatorFees();
      await new Promise(r => setTimeout(r, 3000));
    }

    // Step 2: Check wallet balance (minus rent reserve)
    const walletBalance = await connection.getBalance(wallet.publicKey);
    const available = Math.max(0, (walletBalance / LAMPORTS_PER_SOL) - 0.01);

    if (available < CLAIM_THRESHOLD) {
      log(`… ${available.toFixed(4)} SOL available (threshold: ${CLAIM_THRESHOLD}) — waiting`);
      return;
    }

    log(`✓ ${available.toFixed(4)} SOL available — routing to LP...`);

    // Step 3: Check if any targets need tokens (non-pumpswap targets)
    const needsTokens = targets.some(t => t.type !== "pumpswap");
    let tokensAvailable = BigInt(0);

    if (needsTokens) {
      // Swap half of available SOL for tokens
      const solForSwap = available / 2;
      const { tokensReceived } = await swapSolForToken(solForSwap);
      tokensAvailable = tokensReceived;
      log(`  swapped ${solForSwap.toFixed(4)} SOL → ${tokensReceived.toString()} tokens`);

      // Route remaining SOL + tokens to targets
      const solForLp = available - solForSwap;
      const results = await routeLiquidity(targets, solForLp, tokensAvailable);

      for (const r of results) {
        if (r.sig) log(`  ✓ ${r.target}: ${r.sig}`);
      }
    } else {
      // All targets are PumpSwap — SDK handles token swap internally via deposit
      const results = await routeLiquidity(targets, available, BigInt(0));

      for (const r of results) {
        if (r.sig) log(`  ✓ ${r.target}: ${r.sig}`);
      }
    }

    // Print running totals
    const h = loadHistory();
    log(`═══ cycle complete: ${available.toFixed(4)} SOL routed ═══`);
    log(`    lifetime: ${h.totals.txCount} txs | claimed ${h.totals.claimed.toFixed(4)} | deposited ${h.totals.deposited.toFixed(4)} SOL\n`);
  } catch (err) {
    log(`⚠ cycle error: ${err instanceof Error ? err.message : err}`);
  }
}

async function main() {
  // Parse LP targets from config
  targets = parseLpTargets();

  await printConfig();

  // Verify PumpSwap pool exists (always derived for reference)
  const poolAddr = derivePumpPool();
  const poolInfo = await connection.getAccountInfo(poolAddr);
  if (!poolInfo) {
    log("⚠ canonical PumpSwap pool not found — token may not have graduated yet");
    log("  wet-router will keep checking until the pool exists\n");
  } else {
    log(`✓ PumpSwap pool verified on-chain (${poolInfo.data.length} bytes)\n`);
  }

  log("starting fee monitor...\n");

  // Run immediately
  await cycle();

  // Then poll
  setInterval(cycle, POLL_INTERVAL * 1000);
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
