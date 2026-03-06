import { connection, wallet, log, TOKEN_MINT } from "./config";
import { recordTx } from "./history";
import { OnlinePumpAmmSdk } from "@pump-fun/pump-swap-sdk";
import { PUMP_AMM_SDK } from "@pump-fun/pump-swap-sdk";
import {
  coinCreatorVaultAuthorityPda,
  coinCreatorVaultAtaPda,
} from "@pump-fun/pump-swap-sdk";
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import BN from "bn.js";

const sdk = new OnlinePumpAmmSdk(connection);

/**
 * Get the balance sitting in the creator vault (unclaimed fees).
 */
export async function getCreatorVaultBalance(): Promise<number> {
  try {
    const vaultAuthority = coinCreatorVaultAuthorityPda(wallet.publicKey);
    const vaultAta = coinCreatorVaultAtaPda(vaultAuthority, NATIVE_MINT, TOKEN_PROGRAM_ID);

    const balance = await connection.getBalance(vaultAta);
    return balance / LAMPORTS_PER_SOL;
  } catch (err) {
    // Vault may not exist yet if no fees accumulated
    log(`  vault check: ${err instanceof Error ? err.message : err}`);
    return 0;
  }
}

/**
 * Claim accumulated creator fees from the pump AMM creator vault.
 * Uses the official SDK's collectCoinCreatorFee instruction.
 * 
 * The creator vault accumulates SOL from creator fees on every trade.
 * This function moves that SOL to the creator's (our) wallet.
 */
export async function claimCreatorFees(): Promise<string | null> {
  try {
    const state = await sdk.collectCoinCreatorFeeSolanaState(wallet.publicKey);

    // Check if vault has any balance
    if (!state.coinCreatorVaultAtaAccountInfo) {
      log("  no creator vault found (no fees accumulated yet)");
      return null;
    }

    const preBal = await connection.getBalance(wallet.publicKey);
    const instructions = await PUMP_AMM_SDK.collectCoinCreatorFee(state);

    if (instructions.length === 0) {
      log("  no fees to claim");
      return null;
    }

    const tx = new Transaction().add(...instructions);
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = wallet.publicKey;

    const sig = await connection.sendTransaction(tx, [wallet], {
      skipPreflight: false,
    });
    await connection.confirmTransaction(sig, "confirmed");

    // Get post-claim balance to compute amount claimed
    const postBal = await connection.getBalance(wallet.publicKey);
    const claimedSol = Math.max(0, (postBal - preBal) / LAMPORTS_PER_SOL);
    
    recordTx({
      ts: new Date().toISOString(),
      type: "claim",
      sig,
      sol: claimedSol,
      note: "creator vault fee claim",
    });

    log(`✓ claimed ${claimedSol.toFixed(4)} SOL creator fees — tx: ${sig}`);
    return sig;
  } catch (err) {
    log(`⚠ fee claim failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}
