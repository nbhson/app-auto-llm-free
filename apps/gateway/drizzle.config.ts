import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";
dotenv.config();

const url = process.env.DATABASE_URL || "file:./data.db";
const isPostgres = url.startsWith("postgres");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: isPostgres ? "postgresql" : "sqlite",
  dbCredentials: isPostgres ? { url } : { url },
  verbose: true,
  strict: true,
});
