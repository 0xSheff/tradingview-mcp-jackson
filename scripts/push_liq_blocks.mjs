#!/usr/bin/env node
/**
 * Push scripts/marco_liquidity_blocks.pine into the user's TradingView script
 * "Liq blocks" — the standing rule (the trader, 2026-09-27): the indicator on
 * TradingView follows the repo, no separate confirmation; TradingView keeps
 * the version history, so a rollback is cheap.
 *
 * Safe by construction: it opens "Liq blocks", reads the editor and overwrites
 * only when the editor holds one of the last committed versions of the file
 * (or the working file already). After the save it re-reads the editor and
 * compares with the working file. Never uses pine_new — that drafts inside the
 * open script (docs/MARCO.md §8).
 *
 *   node scripts/push_liq_blocks.mjs            # TradingView Desktop with CDP on 9222
 *   node scripts/push_liq_blocks.mjs --check    # compare only, change nothing
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { openScript, getSource, setSource, smartCompile, save } from "../src/core/pine.js";
import { openPanel } from "../src/core/ui.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "scripts/marco_liquidity_blocks.pine";
const NAME = "Liq blocks";
const checkOnly = process.argv.includes("--check");
const norm = (s) => s.replace(/\r\n/g, "\n").replace(/\s+$/, "");
const done = (code) => setTimeout(() => process.exit(code), 200);

const work = norm(readFileSync(resolve(ROOT, FILE), "utf-8"));
const git = (cmd) => execSync(cmd, { cwd: ROOT, encoding: "utf-8", maxBuffer: 16 * 1024 * 1024 });
const commits = git(`git log -8 --format=%h -- ${FILE}`).split("\n").filter(Boolean);
const known = commits.map((h) => ({ h, text: norm(git(`git show ${h}:${FILE}`)) }));

try {
  // the Pine tools fail when the editor panel is closed — open it first
  await openPanel({ panel: "pine-editor", action: "open" });
  await new Promise((r) => setTimeout(r, 1500));
  const opened = await openScript({ name: NAME });
  if (!opened?.success) throw new Error(`could not open "${NAME}": ${JSON.stringify(opened)}`);
  const before = await getSource();
  const cur = norm(before.source);
  if (cur === work) {
    console.log(`"${NAME}" already holds the working file (${before.line_count} lines) — nothing to push`);
    done(0);
  } else {
    const match = known.find((k) => k.text === cur);
    if (!match) {
      const a = cur.split("\n");
      const b = (known[0]?.text ?? work).split("\n");
      let k = 0;
      while (k < a.length && k < b.length && a[k] === b[k]) k++;
      console.log(`ABORT: "${NAME}" holds ${before.line_count} lines that match neither the working file nor the last ${known.length} committed versions.`);
      console.log(`first difference from ${known[0]?.h ?? "the working file"} at line ${k + 1}:\n  editor: ${a[k]?.slice(0, 120)}\n  repo  : ${b[k]?.slice(0, 120)}`);
      done(2);
    } else if (checkOnly) {
      console.log(`"${NAME}" holds the version of commit ${match.h}; the working file differs — a push is due (--check: nothing changed)`);
      done(0);
    } else {
      console.log(`"${NAME}" holds the version of commit ${match.h} — pushing the working file`);
      await setSource({ source: readFileSync(resolve(ROOT, FILE), "utf-8") });
      const comp = await smartCompile();
      if (comp?.success === false || comp?.has_errors || (comp?.errors?.length ?? 0) > 0) {
        console.log("ABORT: compile errors — not saved (reopen the script to discard the editor's text):", JSON.stringify(comp.errors ?? comp).slice(0, 1500));
        done(3);
      } else {
        await save();
        await new Promise((r) => setTimeout(r, 2500));
        const after = await getSource();
        const ok = norm(after.source) === work;
        console.log(`saved: ${after.line_count} lines; the editor equals the working file: ${ok}`);
        done(ok ? 0 : 4);
      }
    }
  }
} catch (e) {
  console.log("ERROR:", e.message);
  done(1);
}
