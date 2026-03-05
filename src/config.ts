import { config } from "dotenv";
import { Keypair, PublicKey, Connection } from "@solana/web3.js";
import bs58 from "bs58";

config();

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const PRIVATE_KEY = requireEnv("PRIVATE_KEY");
export const RPC_URL = requireEnv("RPC_URL");
export const TOKEN_MINT = new PublicKey(requireEnv("TOKEN_MINT"));

export const CLAIM_THRESHOLD = parseFloat(process.env.CLAIM_THRESHOLD || "0.05");
export const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || "120", 10);
export const SLIPPAGE_BPS = parseInt(process.env.SLIPPAGE_BPS || "200", 10);
export const SLIPPAGE_PCT = parseFloat(process.env.SLIPPAGE_PCT || "2");

// Jupiter API
export const JUPITER_API_KEY = process.env.JUPITER_API_KEY || "";
export const JUPITER_BASE = "https://api.jup.ag/swap/v1";

// Pump.fun program IDs (from official SDK)
export const PUMP_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
export const PUMP_AMM_PROGRAM = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");
export const PUMP_FEE_PROGRAM = new PublicKey("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ");

export const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

export const wallet = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));
export const connection = new Connection(RPC_URL, "confirmed");

// ═══════════════════════════════════════════
// LP TARGET CONFIGURATION
// ═══════════════════════════════════════════
// Format: "target:percent,target:percent" or "all" or single target name
// Examples:
//   LP_TARGETS="pumpswap"                    → 100% to PumpSwap canonical pool
//   LP_TARGETS="meteora"                     → 100% to Meteora DLMM
//   LP_TARGETS="pumpswap:50,meteora:30,raydium:20"  → split
//   LP_TARGETS="all"                         → equal split across all configured pools
//
// Pool addresses (required for each non-pumpswap target):
//   METEORA_POOL=<address>
//   RAYDIUM_POOL=<address>
//   ORCA_POOL=<address>
//   PUMPSWAP_POOL=<address>  (optional — auto-derived from TOKEN_MINT)

export type LpTargetType = "pumpswap" | "meteora" | "raydium" | "orca";

export interface LpTarget {
  type: LpTargetType;
  percent: number;
  pool: PublicKey | null; // null = auto-derive (pumpswap only)
}

export function parseLpTargets(): LpTarget[] {
  const raw = process.env.LP_TARGETS || "pumpswap";

  const poolAddresses: Record<string, string | undefined> = {
    pumpswap: process.env.PUMPSWAP_POOL,
    meteora: process.env.METEORA_POOL,
    raydium: process.env.RAYDIUM_POOL,
    orca: process.env.ORCA_POOL,
  };

  const validTypes: LpTargetType[] = ["pumpswap", "meteora", "raydium", "orca"];

  if (raw.toLowerCase() === "all") {
    // Equal split across all targets that have pool addresses configured
    const configured = validTypes.filter(t => t === "pumpswap" || poolAddresses[t]);
    const pct = Math.floor(100 / configured.length);
    return configured.map((type, i) => ({
      type,
      percent: i === configured.length - 1 ? 100 - pct * (configured.length - 1) : pct,
      pool: poolAddresses[type] ? new PublicKey(poolAddresses[type]!) : null,
    }));
  }

  // Parse "target:pct,target:pct" or just "target"
  const parts = raw.split(",").map(s => s.trim().toLowerCase());
  const targets: LpTarget[] = [];

  for (const part of parts) {
    const [typePart, pctPart] = part.split(":");
    const type = typePart as LpTargetType;

    if (!validTypes.includes(type)) {
      throw new Error(`Invalid LP target: ${typePart}. Valid: ${validTypes.join(", ")}`);
    }

    if (type !== "pumpswap" && !poolAddresses[type]) {
      throw new Error(`${type.toUpperCase()}_POOL env var required when targeting ${type}`);
    }

    targets.push({
      type,
      percent: pctPart ? parseInt(pctPart, 10) : -1, // -1 = calculate later
      pool: poolAddresses[type] ? new PublicKey(poolAddresses[type]!) : null,
    });
  }

  // If no percentages given, split equally
  const hasPercents = targets.some(t => t.percent > 0);
  if (!hasPercents) {
    const pct = Math.floor(100 / targets.length);
    targets.forEach((t, i) => {
      t.percent = i === targets.length - 1 ? 100 - pct * (targets.length - 1) : pct;
    });
  }

  // Validate percentages sum to 100
  const total = targets.reduce((s, t) => s + t.percent, 0);
  if (total !== 100) {
    throw new Error(`LP target percentages must sum to 100, got ${total}`);
  }

  return targets;
}

export function log(msg: string) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${ts}] ${msg}`);
}
