import { readdir, stat } from "node:fs/promises";
import path from "node:path";

async function walk(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await walk(full));
    else found.push(full);
  }
  return found;
}

const files = await walk("dist");
let failed = false;
for (const file of files) {
  const size = (await stat(file)).size;
  const kb = size / 1024;
  console.log(`${kb.toFixed(1).padStart(7)} KiB  ${path.relative("dist", file)}`);
  if (kb > 750) {
    console.error(`Oversized production asset (>750 KiB): ${file}`);
    failed = true;
  }
}
if (failed) process.exitCode = 1;
