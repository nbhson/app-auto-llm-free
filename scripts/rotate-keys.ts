#!/usr/bin/env npx tsx
// Rotate AES-256-GCM encryption for stored provider keys
// Usage: OLD_KEY=... NEW_KEY=... npx tsx scripts/rotate-keys.ts
// Or: npx tsx scripts/rotate-keys.ts --old <oldHex> --new <newHex> --file data/virtual-keys.json

import fs from "node:fs";
import crypto from "node:crypto";

function getKey(hex: string): Buffer {
  const padded = (hex.replace(/[^0-9a-f]/gi, "") + "0".repeat(64)).slice(0, 64);
  return Buffer.from(padded, "hex");
}

function decrypt(ciphertext: string, keyHex: string): string {
  const [ivB64, tagB64, encB64] = ciphertext.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(keyHex), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([decipher.update(Buffer.from(encB64, "base64")), decipher.final()]);
  return dec.toString("utf8");
}

function encrypt(plaintext: string, keyHex: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(keyHex), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

const oldKey = process.env.OLD_KEY || process.argv.find((a) => a.startsWith("--old="))?.split("=")[1] || "";
const newKey = process.env.NEW_KEY || process.argv.find((a) => a.startsWith("--new="))?.split("=")[1] || "";
const file = process.argv.find((a) => a.startsWith("--file="))?.split("=")[1] || "data/provider-keys.json";

if (!oldKey || !newKey) {
  console.log(`Usage: OLD_KEY=<oldHex> NEW_KEY=<newHex> npx tsx scripts/rotate-keys.ts [--file=path]`);
  console.log(`  OLD_KEY: existing ENCRYPTION_KEY (64 hex)`);
  console.log(`  NEW_KEY: new ENCRYPTION_KEY (generate: openssl rand -hex 32)`);
  console.log(`  Example: OLD_KEY=$(grep ENCRYPTION_KEY .env | cut -d= -f2) NEW_KEY=$(openssl rand -hex 32) npx tsx scripts/rotate-keys.ts`);
  process.exit(0);
}

if (!fs.existsSync(file)) {
  console.log(`File ${file} not found — nothing to rotate. For virtual-keys, hashes are not encrypted, only provider_keys table needs rotation.`);
  console.log(`To rotate ENCRYPTION_KEY for future encrypted storage, update .env:`);
  console.log(`  ENCRYPTION_KEY=${newKey}`);
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(file, "utf-8"));
let rotated = 0;
for (const row of data) {
  if (row.encryptedKey) {
    try {
      const plain = decrypt(row.encryptedKey, oldKey);
      row.encryptedKey = encrypt(plain, newKey);
      rotated++;
    } catch (e) {
      console.error(`Failed to rotate ${row.id}:`, (e as Error).message);
    }
  }
}
fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log(`Rotated ${rotated} keys in ${file}`);
console.log(`Update .env: ENCRYPTION_KEY=${newKey}`);
