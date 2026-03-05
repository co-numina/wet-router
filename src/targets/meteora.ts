import { connection, wallet, log, TOKEN_MINT, SLIPPAGE_PCT } from "../config";
import DLMM from "@meteora-ag/dlmm";
import { Keypair, PublicKey, Transaction, LAMPORTS_PER_SOL, sendAndConfirmTransaction } from "@solana/web3.js";
import BN from "bn.js";

/**
 * Add liquidity to a Meteora DLMM pool.
 * 
 * Uses SpotBalanced strategy centered on the active bin.
 * Creates a new position each time (positions are NFTs on Meteora).
 * 
 * The bin range determines concentration:
 * - Narrow (±5 bins): more capital efficient, needs rebalancing
 * - Wide (±20 bins): less efficient, more resilient to price moves
 * 
 * We use ±15 bins as default — good balance for memecoin volatility.
 */
export async function addMeteoraLiquidity(
  solAmount: number,
  tokenAmount: bigint,
  poolAddress: PublicKey,
): Promise<string | null> {
  try {
    log(`  [meteora] pool: ${poolAddress.toBase58()}`);

    // Create DLMM pool instance
    const dlmmPool = await DLMM.create(connection, poolAddress);

    // Get active bin for centering the position
    const activeBin = await dlmmPool.getActiveBin();
    const activeBinId = activeBin.binId;
    log(`  [meteora] active bin: ${activeBinId}, price: ${activeBin.price}`);

    // Position keypair (each deposit creates a new position)
    const positionKeypair = new Keypair();

    // Define bin range: ±15 bins around active
    const BIN_RANGE = 15;
    const minBinId = activeBinId - BIN_RANGE;
    const maxBinId = activeBinId + BIN_RANGE;

    // Build the add liquidity transaction
    const totalXAmount = new BN(tokenAmount.toString());
    const totalYAmount = new BN(Math.floor(solAmount * LAMPORTS_PER_SOL));

    const addLiquidityTx = await dlmmPool.initializePositionAndAddLiquidityByStrategy({
      positionPubKey: positionKeypair.publicKey,
      totalXAmount,
      totalYAmount,
      strategy: {
        strategyType: 0, // SpotBalanced
        minBinId,
        maxBinId,
      },
      user: wallet.publicKey,
      slippage: Math.floor(SLIPPAGE_PCT),
    });

    // Send transaction
    const sig = await sendAndConfirmTransaction(
      connection,
      addLiquidityTx,
      [wallet, positionKeypair],
    );

    log(`  ✓ [meteora] added ${solAmount.toFixed(4)} SOL + tokens — position: ${positionKeypair.publicKey.toBase58()} — tx: ${sig}`);
    return sig;
  } catch (err) {
    log(`  ⚠ [meteora] LP add failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}
