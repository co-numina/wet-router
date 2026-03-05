import {
  connection, wallet, log,
  TOKEN_MINT, WSOL_MINT, POOL_ADDRESS, POOL_TYPE,
} from "./config";
import {
  PublicKey, Transaction, TransactionInstruction,
  LAMPORTS_PER_SOL, SystemProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress, createSyncNativeInstruction,
  TOKEN_PROGRAM_ID, NATIVE_MINT,
} from "@solana/spl-token";

/**
 * Add liquidity to the pool.
 * Takes SOL amount and token amount, adds to LP position.
 */
export async function addLiquidity(
  solAmount: number,
  tokenAmount: bigint,
): Promise<string> {
  log(`→ adding liquidity: ${solAmount.toFixed(4)} SOL + ${tokenAmount.toString()} tokens`);

  if (POOL_TYPE === "meteora") {
    return addMeteoraLiquidity(solAmount, tokenAmount);
  } else {
    return addRaydiumLiquidity(solAmount, tokenAmount);
  }
}

async function addMeteoraLiquidity(solAmount: number, tokenAmount: bigint): Promise<string> {
  const METEORA_DLMM_PROGRAM = new PublicKey("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");

  // Wrap SOL into WSOL account
  const wsolAta = await getAssociatedTokenAddress(NATIVE_MINT, wallet.publicKey);
  const tokenAta = await getAssociatedTokenAddress(TOKEN_MINT, wallet.publicKey);
  const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);

  const tx = new Transaction();

  // Transfer SOL to WSOL ATA and sync
  tx.add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: wsolAta,
      lamports,
    }),
    createSyncNativeInstruction(wsolAta),
  );

  // Meteora DLMM addLiquidity instruction
  // Discriminator: [181, 157, 89, 67, 143, 182, 65, 150]
  const discriminator = Buffer.from([181, 157, 89, 67, 143, 182, 65, 150]);

  // Encode amounts as u64 LE
  const data = Buffer.alloc(8 + 8 + 8);
  discriminator.copy(data, 0);
  data.writeBigUInt64LE(BigInt(lamports), 8);
  data.writeBigUInt64LE(tokenAmount, 16);

  const ix = new TransactionInstruction({
    programId: METEORA_DLMM_PROGRAM,
    keys: [
      { pubkey: POOL_ADDRESS, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: wsolAta, isSigner: false, isWritable: true },
      { pubkey: tokenAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  tx.add(ix);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = wallet.publicKey;

  const sig = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(sig, "confirmed");

  log(`✓ added to LP — tx: ${sig}`);
  return sig;
}

async function addRaydiumLiquidity(solAmount: number, tokenAmount: bigint): Promise<string> {
  const RAYDIUM_CLMM_PROGRAM = new PublicKey("CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK");

  const wsolAta = await getAssociatedTokenAddress(NATIVE_MINT, wallet.publicKey);
  const tokenAta = await getAssociatedTokenAddress(TOKEN_MINT, wallet.publicKey);
  const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);

  const tx = new Transaction();

  tx.add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: wsolAta,
      lamports,
    }),
    createSyncNativeInstruction(wsolAta),
  );

  // Raydium CLMM increaseLiquidity
  // Discriminator: [46, 156, 243, 118, 13, 205, 251, 178]
  const discriminator = Buffer.from([46, 156, 243, 118, 13, 205, 251, 178]);

  const data = Buffer.alloc(8 + 8 + 8);
  discriminator.copy(data, 0);
  data.writeBigUInt64LE(BigInt(lamports), 8);
  data.writeBigUInt64LE(tokenAmount, 16);

  const ix = new TransactionInstruction({
    programId: RAYDIUM_CLMM_PROGRAM,
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: POOL_ADDRESS, isSigner: false, isWritable: true },
      { pubkey: wsolAta, isSigner: false, isWritable: true },
      { pubkey: tokenAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  tx.add(ix);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = wallet.publicKey;

  const sig = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(sig, "confirmed");

  log(`✓ added to LP — tx: ${sig}`);
  return sig;
}
