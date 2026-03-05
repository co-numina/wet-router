import { connection, wallet, log, POOL_ADDRESS, POOL_TYPE } from "./config";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

/**
 * Get claimable creator fees from the pool.
 * 
 * For pump.fun tokens: creator fees accumulate as SOL in the creator's
 * fee account. After migration to Meteora/Raydium, fees come from LP positions.
 * 
 * This checks the wallet's SOL balance as a simple approach.
 * For production: integrate with Meteora DLMM SDK to check unclaimed fees
 * on the specific pool position.
 */

export async function getClaimableFees(): Promise<number> {
  try {
    if (POOL_TYPE === "meteora") {
      return await getMeteoraClaimableFees();
    } else {
      return await getRaydiumClaimableFees();
    }
  } catch (err) {
    log(`⚠ Error checking fees: ${err}`);
    return 0;
  }
}

async function getMeteoraClaimableFees(): Promise<number> {
  // Meteora DLMM pools store fee info in the position account
  // Fetch the pool account data to check pending fees
  const accountInfo = await connection.getAccountInfo(POOL_ADDRESS);
  if (!accountInfo) {
    log("⚠ Pool account not found");
    return 0;
  }

  // Parse Meteora DLMM position data
  // The fee fields are at specific offsets in the account data
  // For DLMM v2: feeX (SOL side) is at offset 128, feeY (token side) at 136
  // These are u64 values representing lamports/smallest token units
  const data = accountInfo.data;
  
  if (data.length < 144) {
    log("⚠ Account data too small for Meteora position");
    return 0;
  }

  // Read fee amounts (little-endian u64)
  const feeXLamports = data.readBigUInt64LE(128);
  const feeSol = Number(feeXLamports) / LAMPORTS_PER_SOL;
  
  return feeSol;
}

async function getRaydiumClaimableFees(): Promise<number> {
  // Raydium concentrated liquidity (CLMM) stores fees in position NFT accounts
  // For standard AMM pools, fees are auto-compounded
  // This is a simplified check — production should use Raydium SDK
  const accountInfo = await connection.getAccountInfo(POOL_ADDRESS);
  if (!accountInfo) {
    log("⚠ Pool account not found");
    return 0;
  }

  // Raydium CLMM position: tokenFeesOwedX at offset 161 (u64)
  const data = accountInfo.data;
  if (data.length < 169) return 0;

  const feeXLamports = data.readBigUInt64LE(161);
  return Number(feeXLamports) / LAMPORTS_PER_SOL;
}

/**
 * Claim fees from the pool position.
 * Returns the amount of SOL claimed.
 */
export async function claimFees(): Promise<number> {
  if (POOL_TYPE === "meteora") {
    return await claimMeteoraFees();
  } else {
    return await claimRaydiumFees();
  }
}

async function claimMeteoraFees(): Promise<number> {
  // Meteora DLMM claim instruction
  // Program: LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo
  const { Transaction, TransactionInstruction, PublicKey } = await import("@solana/web3.js");
  
  const METEORA_DLMM_PROGRAM = new PublicKey("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");
  
  // Get balance before claim
  const balBefore = await connection.getBalance(wallet.publicKey);
  
  // Build claim instruction
  // Discriminator for "claimFee" = [169, 32, 79, 137, 136, 232, 70, 137]
  const discriminator = Buffer.from([169, 32, 79, 137, 136, 232, 70, 137]);
  
  const ix = new TransactionInstruction({
    programId: METEORA_DLMM_PROGRAM,
    keys: [
      { pubkey: POOL_ADDRESS, isSigner: false, isWritable: true },       // position
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },     // owner
      // Additional accounts depend on the specific pool — 
      // In production, derive these from the position account data:
      // lbPair, binArrayLower, binArrayUpper, reserveX, reserveY, 
      // tokenXMint, tokenYMint, userTokenX, userTokenY, tokenProgram
    ],
    data: discriminator,
  });

  const tx = new Transaction().add(ix);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = wallet.publicKey;
  
  const sig = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(sig, "confirmed");
  
  // Check how much SOL we received
  const balAfter = await connection.getBalance(wallet.publicKey);
  const claimed = (balAfter - balBefore) / LAMPORTS_PER_SOL;
  
  log(`✓ claimed ${claimed.toFixed(4)} SOL — tx: ${sig}`);
  return Math.max(0, claimed);
}

async function claimRaydiumFees(): Promise<number> {
  // Raydium CLMM claim instruction
  // Program: CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK
  const { Transaction, TransactionInstruction, PublicKey } = await import("@solana/web3.js");
  
  const RAYDIUM_CLMM_PROGRAM = new PublicKey("CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK");
  
  const balBefore = await connection.getBalance(wallet.publicKey);
  
  // Discriminator for "collectFee" in Raydium CLMM
  const discriminator = Buffer.from([164, 152, 207, 99, 30, 186, 19, 182]);
  
  const ix = new TransactionInstruction({
    programId: RAYDIUM_CLMM_PROGRAM,
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: POOL_ADDRESS, isSigner: false, isWritable: true },
    ],
    data: discriminator,
  });

  const tx = new Transaction().add(ix);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = wallet.publicKey;
  
  const sig = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(sig, "confirmed");
  
  const balAfter = await connection.getBalance(wallet.publicKey);
  const claimed = (balAfter - balBefore) / LAMPORTS_PER_SOL;
  
  log(`✓ claimed ${claimed.toFixed(4)} SOL — tx: ${sig}`);
  return Math.max(0, claimed);
}
