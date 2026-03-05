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
export const SERVICE_WALLET = new PublicKey(requireEnv("SERVICE_WALLET"));

// Optional: pool address for LP adding (if not set, just accumulates SOL)
export const POOL_ADDRESS = process.env.POOL_ADDRESS ? new PublicKey(process.env.POOL_ADDRESS) : null;

export const CLAIM_THRESHOLD = parseFloat(process.env.CLAIM_THRESHOLD || "0.05");
export const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || "120", 10);
export const LP_PERCENTAGE = parseInt(process.env.LP_PERCENTAGE || "100", 10);
export const SLIPPAGE_BPS = parseInt(process.env.SLIPPAGE_BPS || "200", 10);

// Jupiter API (requires free key from portal.jup.ag)
export const JUPITER_API_KEY = process.env.JUPITER_API_KEY || "";
export const JUPITER_BASE = "https://api.jup.ag/swap/v1";

// Pump.fun programs
export const PUMPFUN_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
export const PUMPFUN_AMM = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");
export const PUMPFUN_FEE_PROGRAM = new PublicKey("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ");
// Known constant: fee sharing config PDA seed = ["sharing-config", mint_pubkey]
export const FEE_SHARING_SEED = "sharing-config";

export const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
export const SYSTEM_PROGRAM = new PublicKey("11111111111111111111111111111111");

export const wallet = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));
export const connection = new Connection(RPC_URL, "confirmed");

export function log(msg: string) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${ts}] ${msg}`);
}
