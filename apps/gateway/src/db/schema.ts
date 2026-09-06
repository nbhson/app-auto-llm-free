import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { pgTable, varchar, timestamp } from "drizzle-orm/pg-core";

// Shared shape — actual dialect chosen at runtime via drizzle.config
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("user"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const virtualKeys = sqliteTable("virtual_keys", {
  id: text("id").primaryKey(),
  prefix: text("prefix").notNull().default("fgk-"),
  hash: text("hash").notNull().unique(),
  userId: text("user_id").references(() => users.id),
  name: text("name").notNull(),
  scopes: text("scopes", { mode: "json" }).$type<{ models: string[]; providers: string[] }>(),
  rpmLimit: integer("rpm_limit").notNull().default(60),
  tpdLimit: integer("tpd_limit").notNull().default(100000),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const providerKeys = sqliteTable("provider_keys", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  encryptedKey: text("encrypted_key").notNull(),
  status: text("status").notNull().default("active"),
  lastCheckedAt: integer("last_checked_at", { mode: "timestamp" }),
});

export const requests = sqliteTable("requests", {
  id: text("id").primaryKey(),
  virtualKeyId: text("virtual_key_id").references(() => virtualKeys.id),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  latencyMs: integer("latency_ms"),
  status: text("status").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// pg equivalents (for production) — not used in sqlite mode but kept for type ref
export const usersPg = pgTable("users", {
  id: varchar("id").primaryKey(),
  email: varchar("email").notNull().unique(),
  passwordHash: varchar("password_hash").notNull(),
  role: varchar("role").notNull().default("user"),
  createdAt: timestamp("created_at").notNull(),
});
