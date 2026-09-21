import { integer, pgEnum, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin"]);

/**
 * Kept for future use (e.g. if you add real user accounts later).
 * Not currently used: Historia's public app is anonymous, and the admin
 * dashboard has its own independent username/password login.
 */
export const users = pgTable("users", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

/** Anonymous browser sessions. visitorId is generated client-side and never asks the visitor for a name. */
export const visitorSessions = pgTable("visitor_sessions", {
  visitorId: varchar("visitorId", { length: 40 }).primaryKey(),
  firstSeen: timestamp("firstSeen").defaultNow().notNull(),
  lastSeen: timestamp("lastSeen").defaultNow().notNull(),
  currentPage: varchar("currentPage", { length: 160 }).notNull().default("/"),
  device: varchar("device", { length: 32 }).notNull().default("unknown"),
  userAgent: varchar("userAgent", { length: 512 }),
  eventCount: integer("eventCount").notNull().default(1),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type VisitorSession = typeof visitorSessions.$inferSelect;
export type InsertVisitorSession = typeof visitorSessions.$inferInsert;
