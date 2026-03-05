/**
 * Dry-run test: verify pool derivation, vault lookup, and SDK connectivity.
 * Uses a known graduated pump.fun token — no private key needed.
 */
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { OnlinePumpAmmSdk } from "@pump-fun/pump-swap-sdk";
import {
  canonicalPumpPoolPda,
  coinCreatorVaultAuthorityPda,
  coinCreatorVaultAtaPda,
} from "@pump-fun/pump-swap-sdk";
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";

const RPC = process.env.RPC_URL || "https://mainnet.helius-rpc.com/?api-key=65a496c3-0f36-4efe-a65a-67a716193997";
const connection = new Connection(RPC, "confirmed");
const sdk = new OnlinePumpAmmSdk(connection);

// Use a known graduated pump.fun token for testing
// This is $TRUMP (a well-known graduated token) - replace with any graduated token
const TEST_MINT = new PublicKey(process.argv[2] || "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"); // BONK as fallback

async function main() {
  console.log("=== wet-router dry-run test ===\n");
  console.log(`token mint: ${TEST_MINT.toBase58()}`);

  // 1. Derive canonical pool
  const poolKey = canonicalPumpPoolPda(TEST_MINT);
  console.log(`derived pool: ${poolKey.toBase58()}`);

  // 2. Check if pool exists on-chain
  const poolInfo = await connection.getAccountInfo(poolKey);
  if (poolInfo) {
    console.log(`✓ pool exists (${poolInfo.data.length} bytes, owner: ${poolInfo.owner.toBase58()})`);

    // 3. Fetch pool state via SDK
    try {
      const pool = await sdk.fetchPool(poolKey);
      console.log(`  base mint:  ${pool.baseMint.toBase58()}`);
      console.log(`  quote mint: ${pool.quoteMint.toBase58()}`);
      console.log(`  LP supply:  ${pool.lpSupply.toString()}`);
      console.log(`  creator:    ${pool.creator?.toBase58() || "n/a"}`);
    } catch (e) {
      console.log(`  pool fetch failed: ${e instanceof Error ? e.message : e}`);
    }
  } else {
    console.log(`✗ pool not found — token may not be a graduated pump.fun coin`);
  }

  // 3. Check creator vault (only meaningful if we know the creator)
  // For testing, just show the PDA derivation works
  const testCreator = new PublicKey("11111111111111111111111111111111"); // dummy
  const vaultAuth = coinCreatorVaultAuthorityPda(testCreator);
  const vaultAta = coinCreatorVaultAtaPda(vaultAuth, NATIVE_MINT, TOKEN_PROGRAM_ID);
  console.log(`\ncreator vault PDA derivation test:`);
  console.log(`  authority: ${vaultAuth.toBase58()}`);
  console.log(`  ATA:       ${vaultAta.toBase58()}`);

  console.log("\n=== dry-run complete ===");
}

main().catch(console.error);
