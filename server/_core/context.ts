import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

// Historia has no visitor login: the public app is fully anonymous
// (see VisitorTracker + tracking.touch), and the admin dashboard has its
// own independent username/password cookie (see routers.ts, adminAccessProcedure).
// This context always resolves `user` to null; it's kept for type
// compatibility with anything reading ctx.user.
export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  return {
    req: opts.req,
    res: opts.res,
    user: null,
  };
}
