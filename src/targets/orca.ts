import { connection, wallet, log, WSOL_MINT, SLIPPAGE_PCT } from "../config";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import BN from "bn.js";

/**
 * Add liquidity to an Orca Whirlpool (concentrated liquidity).
 * 
 * Uses @orca-so/whirlpools-sdk for the deposit instruction.
 * Creates a position centered on current tick ±20 tick spacings.
 */
export async function addOrcaLiquidity(
  solAmount: number,
  tokenAmount: bigint,
  poolAddress: PublicKey,
): Promise<string | null> {
  try {
    log(`  [orca] pool: ${poolAddress.toBase58()}`);

    const orcaSdk = await import("@orca-so/whirlpools-sdk") as any;
    const { Wallet: AnchorWallet, AnchorProvider } = await import("@coral-xyz/anchor");
    const commonSdk = await import("@orca-so/common-sdk") as any;

    const {
      WhirlpoolContext,
      buildWhirlpoolClient,
      ORCA_WHIRLPOOL_PROGRAM_ID,
      TickUtil,
      increaseLiquidityQuoteByInputTokenWithParams,
    } = orcaSdk;

    const { Percentage } = commonSdk;

    // Build Orca context
    const anchorWallet = new AnchorWallet(wallet);
    const provider = new AnchorProvider(connection, anchorWallet, {});
    const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
    const client = buildWhirlpoolClient(ctx);

    const whirlpool = await client.getPool(poolAddress);
    const poolData = whirlpool.getData();

    const tickSpacing = poolData.tickSpacing;
    const currentTick = poolData.tickCurrentIndex;
    log(`  [orca] tick: ${currentTick}, spacing: ${tickSpacing}`);

    // Position range: ±20 tick spacings
    const tickLower = TickUtil.getInitializableTickIndex(currentTick - 20 * tickSpacing, tickSpacing);
    const tickUpper = TickUtil.getInitializableTickIndex(currentTick + 20 * tickSpacing, tickSpacing);

    const inputAmount = new BN(Math.floor(solAmount * LAMPORTS_PER_SOL));
    const slippage = Percentage.fromFraction(Math.floor(SLIPPAGE_PCT * 100), 10000);

    // Get liquidity quote
    const quote = increaseLiquidityQuoteByInputTokenWithParams({
      inputTokenMint: WSOL_MINT,
      inputTokenAmount: inputAmount,
      tickLowerIndex: tickLower,
      tickUpperIndex: tickUpper,
      slippageTolerance: slippage,
      tokenMintA: poolData.tokenMintA,
      tokenMintB: poolData.tokenMintB,
      sqrtPrice: poolData.sqrtPrice,
      tickCurrentIndex: currentTick,
      tokenExtensionCtx: undefined,
    } as any);

    // Open position + add liquidity
    const openResult = await (whirlpool as any).openPositionWithMetadata(tickLower, tickUpper, quote);
    const sig = await openResult.tx.buildAndExecute();
    const positionMint = openResult.positionMint || openResult.mint;

    log(`  ✓ [orca] added ${solAmount.toFixed(4)} SOL — position: ${positionMint?.toBase58()} — tx: ${sig}`);
    return sig;
  } catch (err) {
    log(`  ⚠ [orca] LP add failed: ${err instanceof Error ? err.message : err}`);
    log(`  [orca] hint: ensure ORCA_POOL is a valid Whirlpool address`);
    return null;
  }
}
