import {
  connection, wallet, log,
  TOKEN_MINT, WSOL_MINT, JUPITER_BASE, JUPITER_API_KEY, SLIPPAGE_BPS,
} from "./config";
import { recordTx } from "./history";
import { LAMPORTS_PER_SOL, VersionedTransaction } from "@solana/web3.js";

const headers: Record<string, string> = {
  "Content-Type": "application/json",
};
if (JUPITER_API_KEY) {
  headers["x-api-key"] = JUPITER_API_KEY;
}

/**
 * Swap SOL for token using Jupiter Swap API v1.
 */
export async function swapSolForToken(solAmount: number): Promise<{ tokensReceived: bigint; txSig: string }> {
  const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
  log(`→ swapping ${solAmount.toFixed(4)} SOL for token via Jupiter...`);

  // 1. Get quote
  const quoteUrl = new URL(`${JUPITER_BASE}/quote`);
  quoteUrl.searchParams.set("inputMint", WSOL_MINT.toBase58());
  quoteUrl.searchParams.set("outputMint", TOKEN_MINT.toBase58());
  quoteUrl.searchParams.set("amount", lamports.toString());
  quoteUrl.searchParams.set("slippageBps", SLIPPAGE_BPS.toString());

  const quoteRes = await fetch(quoteUrl.toString(), { headers });
  if (!quoteRes.ok) {
    const body = await quoteRes.text();
    throw new Error(`Jupiter quote failed (${quoteRes.status}): ${body}`);
  }
  const quote = await quoteRes.json() as { outAmount: string };
  const outAmount = BigInt(quote.outAmount);
  log(`  quote: ${outAmount.toString()} tokens`);

  // 2. Get swap transaction
  const swapRes = await fetch(`${JUPITER_BASE}/swap`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: wallet.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      dynamicSlippage: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          priorityLevel: "high",
          maxLamports: 200000,
        },
      },
    }),
  });

  if (!swapRes.ok) {
    const body = await swapRes.text();
    throw new Error(`Jupiter swap failed (${swapRes.status}): ${body}`);
  }
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
  recordTx({
    ts: new Date().toISOString(),
    type: "swap",
    sig,
    sol: solAmount,
    tokens: outAmount.toString(),
    note: `SOL → token via Jupiter`,
  });

  log(`✓ swap complete — tx: ${sig}`);

  return { tokensReceived: outAmount, txSig: sig };
}
