import {
  connection, wallet, log,
  TOKEN_MINT, WSOL_MINT, JUPITER_API, SLIPPAGE_BPS,
} from "./config";
import { LAMPORTS_PER_SOL, VersionedTransaction } from "@solana/web3.js";

/**
 * Swap SOL for token using Jupiter v6 API.
 * Returns the amount of tokens received.
 */
export async function swapSolForToken(solAmount: number): Promise<{ tokensReceived: bigint; txSig: string }> {
  const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);

  log(`→ swapping ${solAmount.toFixed(4)} SOL for ${TOKEN_MINT.toBase58().slice(0, 8)}...`);

  // 1. Get quote
  const quoteUrl = new URL(`${JUPITER_API}/quote`);
  quoteUrl.searchParams.set("inputMint", WSOL_MINT.toBase58());
  quoteUrl.searchParams.set("outputMint", TOKEN_MINT.toBase58());
  quoteUrl.searchParams.set("amount", lamports.toString());
  quoteUrl.searchParams.set("slippageBps", SLIPPAGE_BPS.toString());

  const quoteRes = await fetch(quoteUrl.toString());
  if (!quoteRes.ok) throw new Error(`Jupiter quote failed: ${quoteRes.status}`);
  const quote = await quoteRes.json() as { outAmount: string };

  const outAmount = BigInt(quote.outAmount);
  log(`  quote: ${outAmount.toString()} tokens (slippage: ${SLIPPAGE_BPS}bps)`);

  // 2. Get swap transaction
  const swapRes = await fetch(`${JUPITER_API}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: wallet.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 50000,
    }),
  });

  if (!swapRes.ok) throw new Error(`Jupiter swap failed: ${swapRes.status}`);
  const swapData = await swapRes.json() as { swapTransaction: string };

  // 3. Deserialize, sign, send
  const txBuf = Buffer.from(swapData.swapTransaction, "base64");
  const tx = VersionedTransaction.deserialize(txBuf);
  tx.sign([wallet]);

  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: true,
    maxRetries: 3,
  });

  await connection.confirmTransaction(sig, "confirmed");
  log(`✓ swap complete — tx: ${sig}`);

  return { tokensReceived: outAmount, txSig: sig };
}
