import { connection, wallet, log } from "../config";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

/**
 * Add liquidity to a Raydium CLMM pool.
 * 
 * Uses @raydium-io/raydium-sdk-v2 for the deposit instruction.
 * Opens a concentrated position ±20 tick spacings around current price.
 */
export async function addRaydiumLiquidity(
  solAmount: number,
  tokenAmount: bigint,
  poolAddress: PublicKey,
): Promise<string | null> {
  try {
    log(`  [raydium] pool: ${poolAddress.toBase58()}`);

    const { Raydium } = await import("@raydium-io/raydium-sdk-v2");
    const BN = (await import("bn.js")).default;

    const raydium = await Raydium.load({
      connection,
      owner: wallet,
      disableLoadToken: true,
    });

    // Fetch pool info from RPC
    const data = await raydium.clmm.getPoolInfoFromRpc(poolAddress.toBase58());
    const { poolInfo, poolKeys } = data;

    // Get current tick from pool state
    const poolState = poolInfo as any;
    const tickCurrent = poolState.tickCurrent ?? poolState.state?.tickCurrent ?? 0;
    const tickSpacing = poolInfo.config?.tickSpacing ?? poolState.state?.tickSpacing ?? 60;

    log(`  [raydium] tick: ${tickCurrent}, spacing: ${tickSpacing}`);

    // Open position ±20 tick spacings
    const result = await raydium.clmm.openPositionFromBase({
      poolInfo,
      poolKeys,
      ownerInfo: { useSOLBalance: true },
      base: "MintB" as any,
      baseAmount: new BN(Math.floor(solAmount * LAMPORTS_PER_SOL)),
      tickLower: tickCurrent - tickSpacing * 20,
      tickUpper: tickCurrent + tickSpacing * 20,
    } as any);

    const execResult = await (result as any).execute({ sendAndConfirm: true });
    const sig = execResult?.txId ?? execResult?.txIds?.[0] ?? "unknown";

    log(`  ✓ [raydium] added ${solAmount.toFixed(4)} SOL — tx: ${sig}`);
    return sig;
  } catch (err) {
    log(`  ⚠ [raydium] LP add failed: ${err instanceof Error ? err.message : err}`);
    log(`  [raydium] hint: ensure RAYDIUM_POOL is a valid CLMM pool address`);
    return null;
  }
}
