import { connection, wallet, log, TOKEN_MINT, SLIPPAGE_PCT } from "../config";
import { recordTx } from "../history";
import {
  OnlinePumpAmmSdk,
  PUMP_AMM_SDK,
  canonicalPumpPoolPda,
} from "@pump-fun/pump-swap-sdk";
import { Transaction, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import BN from "bn.js";

const sdk = new OnlinePumpAmmSdk(connection);

/**
 * Derive the canonical PumpSwap pool for our token.
 */
export function derivePumpPool(): PublicKey {
  return canonicalPumpPoolPda(TOKEN_MINT);
}

/**
 * Add liquidity to PumpSwap AMM canonical pool.
 */
export async function addPumpswapLiquidity(
  solAmount: number,
  poolOverride?: PublicKey | null,
): Promise<string | null> {
  try {
    const poolKey = poolOverride || derivePumpPool();
    log(`  [pumpswap] pool: ${poolKey.toBase58()}`);

    const state = await sdk.liquiditySolanaState(poolKey, wallet.publicKey);
    const { pool, poolQuoteTokenAccount } = state;

    const quoteReserve = new BN(poolQuoteTokenAccount.amount.toString());
    const quoteIn = new BN(Math.floor(solAmount * LAMPORTS_PER_SOL));
    const lpTokens = quoteIn.mul(pool.lpSupply).div(quoteReserve);

    if (lpTokens.isZero()) {
      log("  [pumpswap] LP tokens would be 0 — amount too small");
      return null;
    }

    const instructions = await PUMP_AMM_SDK.depositInstructions(
      state,
      lpTokens,
      SLIPPAGE_PCT,
    );

    const tx = new Transaction().add(...instructions);
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = wallet.publicKey;

    const sig = await connection.sendTransaction(tx, [wallet], {
      skipPreflight: false,
    });
    await connection.confirmTransaction(sig, "confirmed");

    recordTx({
      ts: new Date().toISOString(),
      type: "lp-deposit",
      sig,
      sol: solAmount,
      pool: poolKey.toBase58(),
      poolType: "pumpswap",
      note: `deposit to PumpSwap canonical pool`,
    });

    log(`  ✓ [pumpswap] added ${solAmount.toFixed(4)} SOL to LP — tx: ${sig}`);
    return sig;
  } catch (err) {
    log(`  ⚠ [pumpswap] LP add failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}
