import { log, LpTarget } from "./config";
import { addPumpswapLiquidity, derivePumpPool } from "./targets/pumpswap";
import { addMeteoraLiquidity } from "./targets/meteora";
import { addRaydiumLiquidity } from "./targets/raydium";
import { addOrcaLiquidity } from "./targets/orca";
import { PublicKey } from "@solana/web3.js";

export { derivePumpPool } from "./targets/pumpswap";

/**
 * Route liquidity to one or more targets based on configuration.
 * 
 * Each target gets its allocated percentage of the total SOL + tokens.
 * For PumpSwap, the SDK handles the 50/50 split internally.
 * For Meteora/Raydium/Orca, we pass pre-swapped token amounts.
 */
export async function routeLiquidity(
  targets: LpTarget[],
  totalSol: number,
  totalTokens: bigint,
): Promise<{ target: string; sig: string | null }[]> {
  const results: { target: string; sig: string | null }[] = [];

  log(`→ routing ${totalSol.toFixed(4)} SOL across ${targets.length} target(s):`);
  for (const t of targets) {
    log(`  ${t.type}: ${t.percent}%${t.pool ? ` (${t.pool.toBase58().slice(0, 8)}...)` : " (auto)"}`);
  }

  for (const target of targets) {
    const solAlloc = totalSol * (target.percent / 100);
    const tokenAlloc = BigInt(Math.floor(Number(totalTokens) * (target.percent / 100)));

    if (solAlloc < 0.001) {
      log(`  [${target.type}] allocation too small (${solAlloc.toFixed(6)} SOL) — skipping`);
      results.push({ target: target.type, sig: null });
      continue;
    }

    log(`\n  [${target.type}] ${solAlloc.toFixed(4)} SOL (${target.percent}%)`);

    let sig: string | null = null;

    switch (target.type) {
      case "pumpswap":
        sig = await addPumpswapLiquidity(solAlloc, target.pool);
        break;

      case "meteora":
        sig = await addMeteoraLiquidity(solAlloc, tokenAlloc, target.pool!);
        break;

      case "raydium":
        sig = await addRaydiumLiquidity(solAlloc, tokenAlloc, target.pool!);
        break;

      case "orca":
        sig = await addOrcaLiquidity(solAlloc, tokenAlloc, target.pool!);
        break;
    }

    results.push({ target: target.type, sig });
  }

  return results;
}
