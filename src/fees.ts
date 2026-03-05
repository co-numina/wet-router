import {
  connection, wallet, log,
  TOKEN_MINT, SERVICE_WALLET,
  PUMPFUN_PROGRAM, PUMPFUN_FEE_PROGRAM, FEE_SHARING_SEED,
  SYSTEM_PROGRAM,
} from "./config";
import {
  PublicKey, Transaction, TransactionInstruction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

/**
 * Derive the fee sharing config PDA for a given token mint.
 * Seeds: ["sharing-config", mint_pubkey]
 */
export function deriveSharingConfig(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(FEE_SHARING_SEED), mint.toBuffer()],
    PUMPFUN_FEE_PROGRAM,
  );
  return pda;
}

/**
 * Derive the creator vault PDA for a given token mint.
 * This is where pump.fun accumulates creator fees.
 * 
 * The vault PDA is derived from the pump.fun main program.
 * Seeds vary — common pattern is ["creator-vault", mint_pubkey] or 
 * the vault address is embedded in the token's bonding curve account.
 * 
 * For now we check the service wallet's SOL balance as the indicator
 * of available funds (fees already distributed to us via fee sharing).
 */
export async function getAvailableBalance(): Promise<number> {
  try {
    const balance = await connection.getBalance(SERVICE_WALLET);
    // Reserve 0.01 SOL for rent + tx fees
    const available = Math.max(0, (balance / LAMPORTS_PER_SOL) - 0.01);
    return available;
  } catch (err) {
    log(`⚠ Error checking balance: ${err}`);
    return 0;
  }
}

/**
 * Call pump.fun's permissionless distribute instruction to move fees
 * from the creator vault to the configured fee sharing recipients.
 * 
 * This is the same instruction Bedrock calls. It's permissionless — 
 * anyone can call it to trigger distribution.
 * 
 * Instruction format (from on-chain analysis):
 * - Program: 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P
 * - Discriminator: 520dd234ba7c57c7 (8 bytes)
 * - Accounts (8):
 *   0: Token mint (the pump.fun token)
 *   1: Creator vault PDA (holds accumulated fees)
 *   2: Fee sharing config PDA (from pfee program)
 *   3: Recipient wallet (where fees go — our service wallet)
 *   4: System program
 *   5: Fee sharing program (pfeeUxB6...)
 *   6: Pump.fun program (self-reference for CPI)
 *   7: Actual recipient (our service wallet, repeated)
 * 
 * Note: Accounts 2-7 may vary per token. The above is based on 
 * observed Bedrock transactions. The creator vault PDA needs to be
 * derived or looked up per token.
 */
export async function triggerDistribute(
  mint: PublicKey,
  creatorVault: PublicKey,
): Promise<string | null> {
  try {
    const sharingConfig = deriveSharingConfig(mint);
    
    // Discriminator from observed transactions: 520dd234ba7c57c7
    const discriminator = Buffer.from("520dd234ba7c57c7", "hex");

    const ix = new TransactionInstruction({
      programId: PUMPFUN_PROGRAM,
      keys: [
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: creatorVault, isSigner: false, isWritable: true },
        { pubkey: sharingConfig, isSigner: false, isWritable: false },
        { pubkey: SERVICE_WALLET, isSigner: false, isWritable: true },
        { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
        { pubkey: PUMPFUN_FEE_PROGRAM, isSigner: false, isWritable: false },
        { pubkey: PUMPFUN_PROGRAM, isSigner: false, isWritable: false },
        { pubkey: SERVICE_WALLET, isSigner: false, isWritable: true },
      ],
      data: discriminator,
    });

    const tx = new Transaction().add(ix);
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = wallet.publicKey;

    const sig = await connection.sendTransaction(tx, [wallet], {
      skipPreflight: false,
    });
    await connection.confirmTransaction(sig, "confirmed");

    log(`✓ triggered fee distribution — tx: ${sig}`);
    return sig;
  } catch (err) {
    log(`⚠ distribute failed: ${err}`);
    return null;
  }
}

/**
 * Look up the creator vault address for a token.
 * This queries recent transactions on the mint to find the vault PDA.
 */
export async function findCreatorVault(mint: PublicKey): Promise<PublicKey | null> {
  try {
    // The creator vault is typically a PDA derived from the pump.fun program
    // Common seeds: [mint_bytes] or ["creator-vault", mint_bytes]
    // We try the common derivation first
    const [vault] = PublicKey.findProgramAddressSync(
      [mint.toBuffer()],
      PUMPFUN_PROGRAM,
    );
    
    // Verify it exists on-chain
    const info = await connection.getAccountInfo(vault);
    if (info) {
      log(`  found creator vault: ${vault.toBase58()}`);
      return vault;
    }

    // Try alternate derivation
    const [vault2] = PublicKey.findProgramAddressSync(
      [Buffer.from("creator-vault"), mint.toBuffer()],
      PUMPFUN_PROGRAM,
    );
    const info2 = await connection.getAccountInfo(vault2);
    if (info2) {
      log(`  found creator vault (alt): ${vault2.toBase58()}`);
      return vault2;
    }

    log(`⚠ could not find creator vault for ${mint.toBase58()}`);
    return null;
  } catch (err) {
    log(`⚠ error finding vault: ${err}`);
    return null;
  }
}
