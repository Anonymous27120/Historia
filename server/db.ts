import { desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { InsertUser, users, visitorSessions } from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const client = postgres(process.env.DATABASE_URL, { max: 5 });
      _db = drizzle(client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// Kept for future use if you add real user accounts; not currently called
// anywhere (see server/_core/context.ts).
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId, lastSignedIn: user.lastSignedIn ?? new Date() };
    if (user.name !== undefined) values.name = user.name;
    if (user.email !== undefined) values.email = user.email;
    if (user.loginMethod !== undefined) values.loginMethod = user.loginMethod;
    if (user.role !== undefined) values.role = user.role;
    await db
      .insert(users)
      .values(values)
      .onConflictDoUpdate({ target: users.openId, set: values });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function touchVisitor(input: { visitorId: string; currentPage: string; device: string; userAgent?: string }) {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  await db
    .insert(visitorSessions)
    .values({
      visitorId: input.visitorId,
      firstSeen: now,
      lastSeen: now,
      currentPage: input.currentPage,
      device: input.device,
      userAgent: input.userAgent?.slice(0, 512) ?? null,
      eventCount: 1,
    })
    .onConflictDoUpdate({
      target: visitorSessions.visitorId,
      set: {
        lastSeen: now,
        currentPage: input.currentPage,
        device: input.device,
        userAgent: input.userAgent?.slice(0, 512) ?? null,
        eventCount: sql`${visitorSessions.eventCount} + 1`,
      },
    });
}

export async function getVisitorDashboard() {
  const db = await getDb();
  if (!db) return { totalVisitors: 0, activeVisitors: 0, visitors: [] };
  const visitors = await db.select().from(visitorSessions).orderBy(desc(visitorSessions.lastSeen)).limit(200);
  const activeSince = new Date(Date.now() - 2 * 60 * 1000);
  return {
    totalVisitors: visitors.length,
    activeVisitors: visitors.filter((visitor) => visitor.lastSeen >= activeSince).length,
    visitors: visitors.map((visitor) => ({ ...visitor, isOnline: visitor.lastSeen >= activeSince })),
  };
}
