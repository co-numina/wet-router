import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const HISTORY_DIR = join(__dirname, "..", "data");
const HISTORY_FILE = join(HISTORY_DIR, "tx-history.json");

export type TxType = "claim" | "swap" | "lp-deposit";

export interface TxRecord {
  ts: string;           // ISO timestamp
  type: TxType;
  sig: string;          // transaction signature
  sol: number;          // SOL amount involved
  tokens?: string;      // token amount (bigint as string)
  pool?: string;        // pool address
  poolType?: string;    // pumpswap | meteora | raydium | orca
  note?: string;        // extra context
}

export interface TxHistory {
  records: TxRecord[];
  totals: {
    claimed: number;
    swapped: number;
    deposited: number;
    txCount: number;
  };
}

function ensureDir() {
  if (!existsSync(HISTORY_DIR)) {
    mkdirSync(HISTORY_DIR, { recursive: true });
  }
}

export function loadHistory(): TxHistory {
  ensureDir();
  if (!existsSync(HISTORY_FILE)) {
    return { records: [], totals: { claimed: 0, swapped: 0, deposited: 0, txCount: 0 } };
  }
  return JSON.parse(readFileSync(HISTORY_FILE, "utf-8"));
}

function saveHistory(h: TxHistory) {
  ensureDir();
  writeFileSync(HISTORY_FILE, JSON.stringify(h, null, 2));
}

export function recordTx(record: TxRecord) {
  const h = loadHistory();
  h.records.push(record);
  h.totals.txCount++;
  
  switch (record.type) {
    case "claim":
      h.totals.claimed += record.sol;
      break;
    case "swap":
      h.totals.swapped += record.sol;
      break;
    case "lp-deposit":
      h.totals.deposited += record.sol;
      break;
  }
  
  saveHistory(h);
}

/**
 * Print full transaction history to stdout.
 */
export function printHistory(opts?: { last?: number }) {
  const h = loadHistory();
  const records = opts?.last ? h.records.slice(-opts.last) : h.records;

  if (records.length === 0) {
    console.log("no transactions recorded yet\n");
    return;
  }

  console.log(`\n╔══════════════════════════════════════════════════════════════════════════╗`);
  console.log(`║  wet-router transaction history (${h.records.length} total)                              ║`);
  console.log(`╠══════════════════════════════════════════════════════════════════════════╣`);
  console.log(`║  totals: claimed ${h.totals.claimed.toFixed(4)} SOL | swapped ${h.totals.swapped.toFixed(4)} SOL | deposited ${h.totals.deposited.toFixed(4)} SOL`);
  console.log(`╠══════════════════════════════════════════════════════════════════════════╣`);

  for (const r of records) {
    const time = r.ts.replace("T", " ").slice(0, 19);
    const sigShort = r.sig.slice(0, 20) + "...";
    const solStr = r.sol.toFixed(4).padStart(8);

    let line = `║  ${time}  ${r.type.padEnd(12)} ${solStr} SOL`;

    if (r.poolType) {
      line += `  → ${r.poolType}`;
    }
    if (r.pool) {
      line += ` (${r.pool.slice(0, 12)}...)`;
    }
    if (r.tokens) {
      line += `  tokens: ${r.tokens}`;
    }

    console.log(line);
    console.log(`║    tx: ${r.sig}`);
  }

  console.log(`╚══════════════════════════════════════════════════════════════════════════╝\n`);
}
