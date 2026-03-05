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
export const POOL_ADDRESS = new PublicKey(requireEnv("POOL_ADDRESS"));
export const POOL_TYPE = (process.env.POOL_TYPE || "meteora") as "meteora" | "raydium";
export const CLAIM_THRESHOLD = parseFloat(process.env.CLAIM_THRESHOLD || "0.1");
export const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || "60", 10);
export const LP_PERCENTAGE = parseInt(process.env.LP_PERCENTAGE || "100", 10);
export const SLIPPAGE_BPS = parseInt(process.env.SLIPPAGE_BPS || "100", 10);

export const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
export const JUPITER_API = "https://quote-api.jup.ag/v6";

export const wallet = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));
export const connection = new Connection(RPC_URL, "confirmed");

export function log(msg: string) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${ts}] ${msg}`);
}
