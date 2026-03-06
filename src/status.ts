#!/usr/bin/env npx tsx
/**
 * wet-router status — show full transaction history
 * 
 * Usage:
 *   npx tsx src/status.ts              # full history
 *   npx tsx src/status.ts --last 20    # last 20 txs
 *   npx tsx src/status.ts --json       # raw JSON output
 */
import { loadHistory, printHistory } from "./history";

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const lastIdx = args.indexOf("--last");
const last = lastIdx !== -1 ? parseInt(args[lastIdx + 1], 10) : undefined;

if (jsonMode) {
  const h = loadHistory();
  const records = last ? h.records.slice(-last) : h.records;
  console.log(JSON.stringify({ ...h, records }, null, 2));
} else {
  printHistory({ last });
}
