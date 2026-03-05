import {
  connection, wallet, log,
  CLAIM_THRESHOLD, POLL_INTERVAL, LP_PERCENTAGE,
  TOKEN_MINT, SERVICE_WALLET, POOL_ADDRESS,
} from "./config";
import { getAvailableBalance, triggerDistribute, findCreatorVault } from "./fees";
import { swapSolForToken } from "./swap";
import { addLiquidity } from "./liquidity";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

// ════════════════════════════════════════════
// wet-router v2 — real fee-to-LP automation
// uses pump.fun fee sharing (permissionless)
// no protocol. no fee. no middleman.
// ════════════════════════════════════════════

let creatorVault: PublicKey | null = null;

async function printConfig() {
  const bal = await connection.getBalance(wallet.publicKey);
  const serviceBal = await connection.getBalance(SERVICE_WALLET);
  console.log(`
╔══════════════════════════════════════════════╗
║          wet-router v2.0.0                    ║
║   pump.fun fee sharing → LP automation        ║
║   no protocol. no fee. no middleman.          ║
╚══════════════════════════════════════════════╝

  operator wallet:  ${wallet.publicKey.toBase58()}
  operator balance: ${(bal / LAMPORTS_PER_SOL).toFixed(4)} SOL
  service wallet:   ${SERVICE_WALLET.toBase58()}
  service balance:  ${(serviceBal / LAMPORTS_PER_SOL).toFixed(4)} SOL
  token mint:       ${TOKEN_MINT.toBase58()}
  pool:             ${POOL_ADDRESS?.toBase58() || "not set (buy-only mode)"}
  threshold:        ${CLAIM_THRESHOLD} SOL
  LP allocation:    ${LP_PERCENTAGE}%
  poll interval:    ${POLL_INTERVAL}s
`);
}

/**
 * Main cycle:
 * 1. Call pump.fun's permissionless distribute to move fees to service wallet
 * 2. Check service wallet balance
 * 3. If above threshold: swap half to tokens, add to LP (or hold)
 */
async function cycle() {
  try {
    // Step 1: Try to trigger fee distribution from creator vault
    if (creatorVault) {
      log("→ triggering fee distribution from creator vault...");
      await triggerDistribute(TOKEN_MINT, creatorVault);
      // Wait a moment for the tx to settle
      await new Promise(r => setTimeout(r, 3000));
    }

    // Step 2: Check available balance in service wallet
    const available = await getAvailableBalance();
    
    if (available < CLAIM_THRESHOLD) {
      log(`… ${available.toFixed(4)} SOL available (threshold: ${CLAIM_THRESHOLD}) — waiting`);
      return;
    }

    log(`✓ ${available.toFixed(4)} SOL available — routing to LP...`);

    // Step 3: Calculate allocation
    const toLp = available * (LP_PERCENTAGE / 100);
    const toKeep = available - toLp;

    if (toKeep > 0) {
      log(`  reserving ${toKeep.toFixed(4)} SOL for operating costs`);
    }

    if (toLp < 0.005) {
      log(`  LP amount too small (${toLp.toFixed(4)} SOL) — skipping`);
      return;
    }

    // Step 4: Swap half to tokens via Jupiter
    const solForSwap = toLp / 2;
    const solForLp = toLp - solForSwap;

    const { tokensReceived } = await swapSolForToken(solForSwap);

    // Step 5: Add to LP (or hold if no pool set)
    if (POOL_ADDRESS) {
      await addLiquidity(solForLp, tokensReceived);
    } else {
      log(`  no pool configured — holding ${tokensReceived.toString()} tokens + ${solForLp.toFixed(4)} SOL`);
      log(`  these can be manually added to LP at any time`);
    }

    log(`═══ cycle complete: ${available.toFixed(4)} SOL → ${toLp.toFixed(4)} SOL routed ═══`);
  } catch (err) {
    log(`⚠ cycle error: ${err}`);
  }
}

async function main() {
  await printConfig();

  // Find creator vault for the token
  log("looking up creator vault...");
  creatorVault = await findCreatorVault(TOKEN_MINT);
  if (!creatorVault) {
    log("⚠ could not find creator vault — will skip distribute calls");
    log("  (fees must be manually distributed or arrive via fee sharing)");
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
