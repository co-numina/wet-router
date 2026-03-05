import {
  connection, wallet, log,
  CLAIM_THRESHOLD, POLL_INTERVAL, LP_PERCENTAGE,
  TOKEN_MINT, POOL_ADDRESS, POOL_TYPE,
} from "./config";
import { getClaimableFees, claimFees } from "./fees";
import { swapSolForToken } from "./swap";
import { addLiquidity } from "./liquidity";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

// ════════════════════════════════════════════
// wet-router — free fee-to-LP automation
// no protocol. no fee. no middleman.
// ════════════════════════════════════════════

async function printConfig() {
  const bal = await connection.getBalance(wallet.publicKey);
  console.log(`
╔══════════════════════════════════════════╗
║          wet-router v1.0.0               ║
║   free fee-to-LP automation              ║
║   no protocol. no fee. no middleman.     ║
╚══════════════════════════════════════════╝

  wallet:      ${wallet.publicKey.toBase58()}
  balance:     ${(bal / LAMPORTS_PER_SOL).toFixed(4)} SOL
  token:       ${TOKEN_MINT.toBase58()}
  pool:        ${POOL_ADDRESS.toBase58()}
  pool type:   ${POOL_TYPE}
  threshold:   ${CLAIM_THRESHOLD} SOL
  LP %:        ${LP_PERCENTAGE}%
  poll:        every ${POLL_INTERVAL}s
`);
}

async function cycle() {
  try {
    // 1. Check claimable fees
    const claimable = await getClaimableFees();
    
    if (claimable < CLAIM_THRESHOLD) {
      log(`… ${claimable.toFixed(4)} SOL claimable (threshold: ${CLAIM_THRESHOLD}) — waiting`);
      return;
    }

    log(`✓ ${claimable.toFixed(4)} SOL claimable — claiming...`);

    // 2. Claim fees
    const claimed = await claimFees();
    if (claimed <= 0) {
      log("⚠ claim returned 0 SOL — skipping");
      return;
    }

    // 3. Calculate LP allocation
    const toLp = claimed * (LP_PERCENTAGE / 100);
    const toWallet = claimed - toLp;

    if (toWallet > 0) {
      log(`  keeping ${toWallet.toFixed(4)} SOL in wallet`);
    }

    if (toLp < 0.001) {
      log(`  LP amount too small (${toLp.toFixed(4)} SOL) — skipping LP add`);
      return;
    }

    // 4. Split: half SOL stays SOL, half buys tokens
    const solForSwap = toLp / 2;
    const solForLp = toLp - solForSwap;

    // 5. Swap half to tokens
    const { tokensReceived } = await swapSolForToken(solForSwap);

    // 6. Add both sides to LP
    await addLiquidity(solForLp, tokensReceived);

    log(`═══ cycle complete: ${claimed.toFixed(4)} SOL claimed → ${toLp.toFixed(4)} SOL routed to LP ═══`);
  } catch (err) {
    log(`⚠ cycle error: ${err}`);
  }
}

async function main() {
  await printConfig();

  log("starting fee monitor...");

  // Run immediately
  await cycle();

  // Then poll
  setInterval(cycle, POLL_INTERVAL * 1000);
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
