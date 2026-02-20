import "dotenv/config";
import pkg from "mssql";
const { connect } = pkg;
import type { ConnectionPool } from "mssql";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { hashPassword } from "../auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  user: process.env.DB_USER!,
  password: process.env.DB_PASS!,
  server: process.env.DB_HOST || "db",
  database: "master", // Connect to master first to create DB if needed
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function runScript(pool: ConnectionPool, filePath: string, replacements: Record<string, string> = {}) {
  console.log(`Reading ${filePath}...`);
  let content = await fs.readFile(filePath, "utf-8");

  for (const [key, value] of Object.entries(replacements)) {
    content = content.replace(key, value);
  }

  // Split by GO
  const batches = content
    .split(/\nGO\b/i)
    .map(b => b.trim())
    .filter(b => b.length > 0);

  for (const batch of batches) {
    try {
      await pool.query(batch);
    } catch (e: any) {
      console.error(`Error executing batch:\n${batch.substring(0, 100)}...\nError: ${e.message}`);
      throw e;
    }
  }
  console.log(`Executed ${batches.length} batches from ${path.basename(filePath)}`);
}

async function main() {
  console.log("Connecting to SQL Server...");
  const pool = await connect(config);

  try {
    // 1. Init Schema
    const initPath = path.resolve(__dirname, "../../db/01-init.sql");
    await runScript(pool, initPath);

    // Reconnect to the specific database for seeding (although USE command in script handles it, good to be safe)
    // The scripts have "USE OmniChatDev", so we are good.

    // 2. Prepare Seed Data
    const passwordHash = await hashPassword("123456");
    const hashHex = passwordHash.toString("hex");

    const seedPath = path.resolve(__dirname, "../../db/02-seed.sql");
    await runScript(pool, seedPath, {
      "__PASSWORD_HASH__": hashHex
    });

    console.log("✅ Database reset and seeded successfully!");
  } catch (err) {
    console.error("❌ Failed:", err);
    process.exit(1);
  } finally {
    await pool.close();
  }
}

main();
