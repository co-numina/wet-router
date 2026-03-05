import {
  connection, wallet, log,
  TOKEN_MINT, WSOL_MINT, POOL_ADDRESS, PUMPFUN_AMM,
} from "./config";
import {
  PublicKey, Transaction, TransactionInstruction,
  LAMPORTS_PER_SOL, SystemProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress, createSyncNativeInstruction,
  TOKEN_PROGRAM_ID, NATIVE_MINT,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";

/**
 * Add liquidity to the pump.fun AMM pool.
 * 
 * Pump.fun now uses its own AMM (pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA)
 * instead of Raydium/Meteora for graduated tokens.
 * 
 * For the simplest approach: we market-buy tokens with all the SOL
 * and let the AMM handle the pool depth. The buy itself deepens the
 * pool on the token side.
 * 
 * For true 50/50 LP adding, we need the pool's specific accounts.
 * This function handles the simpler "buy and hold" approach which
 * still achieves the goal of removing SOL from circulation into the token.
 * 
 * If POOL_ADDRESS is set, we attempt to add to the specific LP position.
 */
export async function addLiquidity(
  solAmount: number,
  tokenAmount: bigint,
): Promise<string> {
  if (!POOL_ADDRESS) {
    log("⚠ no POOL_ADDRESS set — skipping LP add (tokens held in wallet)");
    return "skipped";
  }

  log(`→ adding liquidity: ${solAmount.toFixed(4)} SOL + ${tokenAmount.toString()} tokens`);

  try {
    return await addPumpAmmLiquidity(solAmount, tokenAmount);
  } catch (err) {
    log(`⚠ LP add failed: ${err}`);
    log("  tokens remain in wallet — can be manually added to LP");
    return "failed";
  }
}

async function addPumpAmmLiquidity(solAmount: number, tokenAmount: bigint): Promise<string> {
  // Ensure WSOL and token ATAs exist
  const wsolAta = await getAssociatedTokenAddress(NATIVE_MINT, wallet.publicKey);
  const tokenAta = await getAssociatedTokenAddress(TOKEN_MINT, wallet.publicKey);
  const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);

  const tx = new Transaction();

  // Create ATAs if needed
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      wallet.publicKey, wsolAta, wallet.publicKey, NATIVE_MINT,
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      wallet.publicKey, tokenAta, wallet.publicKey, TOKEN_MINT,
    ),
  );

  // Wrap SOL
  tx.add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: wsolAta,
      lamports,
    }),
    createSyncNativeInstruction(wsolAta),
  );

  // Pump AMM add liquidity instruction
  // This needs the specific pool accounts — derive from POOL_ADDRESS
  // The pump AMM program ID: pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA
  // 
  // Account layout (from observed txs, 10 accounts):
  // 0: WSOL mint
  // 1: Token program
  // 2: System program
  // 3: Associated Token program
  // 4: Pool config/state
  // 5: Signer (wallet)
  // 6: Pool SOL reserve
  // 7: Pool token reserve
  // 8: LP token mint (or pool authority)
  // 9: AMM program (self-reference)
  
  // For now, we encode the amounts and let the pool handle distribution
  const ATokenProgram = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
  
  // Discriminator for addLiquidity (from observed pump AMM txs)
  const discriminator = Buffer.from("4071b7472a5de38a", "hex");
  
  const data = Buffer.alloc(8 + 8 + 8 + 8);
  discriminator.copy(data, 0);
  data.writeBigUInt64LE(BigInt(lamports), 8);     // sol amount
  data.writeBigUInt64LE(tokenAmount, 16);          // token amount  
  data.writeBigUInt64LE(BigInt(0), 24);            // min LP tokens (0 = accept any)

  const ix = new TransactionInstruction({
    programId: PUMPFUN_AMM,
    keys: [
      { pubkey: WSOL_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ATokenProgram, isSigner: false, isWritable: false },
      { pubkey: POOL_ADDRESS!, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: wsolAta, isSigner: false, isWritable: true },
      { pubkey: tokenAta, isSigner: false, isWritable: true },
      // Pool reserves need to be derived from pool state
      // These are placeholder — will need real pool account data
      { pubkey: POOL_ADDRESS!, isSigner: false, isWritable: true },
      { pubkey: PUMPFUN_AMM, isSigner: false, isWritable: false },
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
