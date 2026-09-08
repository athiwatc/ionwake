import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(root, "public", "sprites");
const needed = [
  "player.png",
  "scout.png",
  "fighter.png",
  "heavy.png",
  "bolt-player.png",
  "bolt-enemy.png",
  "muzzle.png",
  "explode.png",
  "pickups.png",
  "shield.png",
];

if (needed.every((n) => existsSync(join(dest, n)))) process.exit(0);

mkdirSync(dest, { recursive: true });
const base = "https://raw.githubusercontent.com/athiwatc/ionwake/main/public";
const extras = ["og.jpg", "x-banner.jpg"];

async function pull(rel) {
  const out = join(root, "public", rel);
  if (existsSync(out)) return;
  mkdirSync(dirname(out), { recursive: true });
  const res = await fetch(`${base}/${rel}`);
  if (!res.ok) throw new Error(`fetch ${rel}: ${res.status}`);
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
}

await Promise.all([...needed.map((n) => pull(`sprites/${n}`)), ...extras.map(pull)]);
