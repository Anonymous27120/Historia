import { z } from "zod";
import { createHmac, timingSafeEqual } from "node:crypto";
import { parse as parseCookie } from "cookie";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM } from "./_core/llm";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getVisitorDashboard, touchVisitor } from "./db";

const historyMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8000),
});

const audienceSchema = z.enum(["curieux", "enfant", "etudiant", "passionne"]);
const ADMIN_ACCESS_COOKIE = "historia_admin_access";
const ADMIN_USERNAME = process.env.HISTORIA_ADMIN_USERNAME ?? "Hoel";
const ADMIN_PASSWORD = process.env.HISTORIA_ADMIN_PASSWORD ?? "admin237";

function signAdminAccess(username: string, issuedAt = Date.now()) {
  const payload = `${username}.${issuedAt}`;
  const signature = createHmac("sha256", process.env.JWT_SECRET ?? "historia-local-secret").update(payload).digest("hex");
  return `${payload}.${signature}`;
}

function hasValidAdminAccess(req: { headers: { cookie?: string } }) {
  const token = parseCookie(req.headers.cookie ?? "")[ADMIN_ACCESS_COOKIE];
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== ADMIN_USERNAME) return false;
  const issuedAt = Number(parts[1]);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > 12 * 60 * 60 * 1000) return false;
  const expected = signAdminAccess(parts[0], issuedAt).split(".")[2] ?? "";
  const actual = parts[2] ?? "";
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

const adminAccessProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!hasValidAdminAccess(ctx.req) && ctx.user?.role !== "admin") {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Connexion administrateur requise." });
  }
  return next({ ctx });
});

type HistorySource = {
  title: string;
  url: string;
  excerpt: string;
};

const historiaSystemPrompt = `Tu es Historia, une IA pédagogue et rigoureuse spécialisée en histoire mondiale. Réponds en français, sauf si l'utilisateur demande une autre langue.

Règles essentielles :
- Réponds directement, puis structure avec des titres courts, des dates et des listes si utile.
- Distingue les faits établis, les interprétations débattues et les incertitudes. Ne présente jamais une hypothèse comme une certitude.
- Donne le contexte géographique et chronologique, et explique les termes difficiles.
- Quand une question est ambiguë, fais une hypothèse explicite ou pose une question de précision.
- Pour un sujet sensible (guerre, génocide, colonisation, esclavage, religion, identité), reste factuel, nuancé et non sensationnaliste.
- Si tu ne sais pas ou si les sources divergent fortement, dis-le clairement.
- Ne fabrique jamais de citation, de référence ou de date.
- Termine si possible par une idée de question connexe pour poursuivre l'exploration.`;

const audienceInstructions: Record<z.infer<typeof audienceSchema>, string> = {
  curieux: "Explique avec clarté et sans jargon, pour un public général.",
  enfant: "Explique avec des phrases courtes, des exemples concrets et un vocabulaire adapté à un enfant, sans être infantilisant.",
  etudiant: "Ajoute les notions, causes, conséquences et débats utiles à un étudiant, avec une structure révisable.",
  passionne: "Va plus loin dans les nuances historiographiques, les comparaisons et les limites des sources.",
};

async function searchWikipedia(query: string): Promise<HistorySource[]> {
  const trimmed = query.trim().slice(0, 180);
  if (!trimmed) return [];

  try {
    const endpoint = new URL("https://fr.wikipedia.org/w/api.php");
    endpoint.searchParams.set("action", "query");
    endpoint.searchParams.set("list", "search");
    endpoint.searchParams.set("srsearch", trimmed);
    endpoint.searchParams.set("srlimit", "3");
    endpoint.searchParams.set("format", "json");
    const response = await fetch(endpoint, { headers: { "User-Agent": "Historia/2.0 educational assistant" } });
    if (!response.ok) return [];
    const data = (await response.json()) as {
      query?: { search?: Array<{ title: string; snippet?: string }> };
    };
    return (data.query?.search ?? []).slice(0, 3).map((page) => ({
      title: page.title,
      excerpt: (page.snippet ?? "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#039;/g, "'"),
      url: `https://fr.wikipedia.org/wiki/${encodeURIComponent(page.title.replaceAll(" ", "_"))}`,
    }));
  } catch {
    return [];
  }
}

function extractText(content: unknown): string {
  if (Array.isArray(content)) {
    return content
      .filter((part): part is { type: "text"; text: string } => Boolean(part && typeof part === "object" && "type" in part && part.type === "text" && "text" in part))
      .map((part) => part.text)
      .join("\n");
  }
  return typeof content === "string" ? content : "";
}

function rethrowLLMError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/usage exhausted|quota|rate limit/i.test(message)) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Le quota Historia est temporairement épuisé. Réessayez plus tard." });
  }
  throw error;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  admin: router({
    login: publicProcedure
      .input(z.object({ username: z.string().min(1).max(80), password: z.string().min(1).max(160) }))
      .mutation(({ input, ctx }) => {
        if (input.username !== ADMIN_USERNAME || input.password !== ADMIN_PASSWORD) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Identifiants administrateur invalides." });
        }
        ctx.res.cookie(ADMIN_ACCESS_COOKIE, signAdminAccess(ADMIN_USERNAME), {
          ...getSessionCookieOptions(ctx.req),
          maxAge: 12 * 60 * 60 * 1000,
          sameSite: "lax",
          httpOnly: true,
        });
        return { success: true, username: ADMIN_USERNAME } as const;
      }),
    session: publicProcedure.query(({ ctx }) => ({
      authorized: hasValidAdminAccess(ctx.req) || ctx.user?.role === "admin",
      username: ADMIN_USERNAME,
    })),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(ADMIN_ACCESS_COOKIE, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  tracking: router({
    touch: publicProcedure
      .input(z.object({
        visitorId: z.string().regex(/^[A-Za-z0-9_-]{4,32}$/),
        currentPage: z.string().min(1).max(160).default("/"),
        device: z.enum(["iphone", "ipad", "android", "desktop", "tablet", "unknown"]).default("unknown"),
      }))
      .mutation(async ({ input, ctx }) => {
        await touchVisitor({
          ...input,
          userAgent: Array.isArray(ctx.req.headers["user-agent"])
            ? ctx.req.headers["user-agent"][0]
            : ctx.req.headers["user-agent"],
        });
        return { ok: true } as const;
      }),
    dashboard: adminAccessProcedure.query(async () => getVisitorDashboard()),
  }),
  history: router({
    ask: publicProcedure
      .input(z.object({
        messages: z.array(historyMessageSchema).min(1).max(12),
        audience: audienceSchema.default("curieux"),
        useResearch: z.boolean().default(true),
      }))
      .mutation(async ({ input }) => {
        const latestQuestion = [...input.messages].reverse().find((message) => message.role === "user")?.content ?? "";
        const sources = input.useResearch ? await searchWikipedia(latestQuestion) : [];
        const sourceContext = sources.length
          ? `\n\nContexte documentaire à vérifier et citer prudemment si utile :\n${sources.map((source) => `- ${source.title}: ${source.excerpt}`).join("\n")}`
          : "";

        let response;
        try {
          response = await invokeLLM({
            model: process.env.HISTORIA_CHAT_MODEL ?? "llama-3.3-70b-versatile",
            maxTokens: 2800,
            messages: [
              { role: "system", content: `${historiaSystemPrompt}\n\nProfil choisi : ${audienceInstructions[input.audience]}${sourceContext}` },
              ...input.messages.map((message) => ({ role: message.role, content: message.content })),
            ],
          });
        } catch (error) {
          rethrowLLMError(error);
        }

        const answer = extractText(response.choices?.[0]?.message?.content);
        if (!answer) throw new Error("Historia n’a pas renvoyé de réponse exploitable.");
        return { answer, model: response.model, sources };
      }),
    quiz: publicProcedure
      .input(z.object({ topic: z.string().min(2).max(160), audience: audienceSchema.default("curieux") }))
      .mutation(async ({ input }) => {
        let response;
        try {
          response = await invokeLLM({
            model: process.env.HISTORIA_QUIZ_MODEL ?? "openai/gpt-oss-20b",
            maxTokens: 5000,
            messages: [
              { role: "system", content: `Tu crées des quiz historiques exacts et pédagogiques en français. ${audienceInstructions[input.audience]} Ne fabrique pas de dates. Retourne uniquement le JSON demandé.` },
              { role: "user", content: `Crée 5 questions à choix multiple sur : ${input.topic}` },
            ],
            responseFormat: {
            type: "json_schema",
            json_schema: {
              name: "historia_quiz",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  questions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        question: { type: "string" },
                        options: { type: "array", items: { type: "string" } },
                        answerIndex: { type: "integer" },
                        explanation: { type: "string" },
                      },
                      required: ["question", "options", "answerIndex", "explanation"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["title", "questions"],
                additionalProperties: false,
              },
            },
            },
          });
        } catch (error) {
          rethrowLLMError(error);
        }
        const raw = extractText(response.choices?.[0]?.message?.content);
        if (!raw) throw new Error("Le générateur de quiz n’a pas renvoyé de contenu.");
        try {
          const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
          return JSON.parse(cleaned) as { title: string; questions: Array<{ question: string; options: string[]; answerIndex: number; explanation: string }> };
        } catch {
          return {
            title: `Quiz express · ${input.topic}`,
            questions: [
              { question: `Quel est le meilleur point de départ pour étudier ${input.topic} ?`, options: ["Le contexte historique", "Une anecdote isolée", "Une prédiction", "Une publicité"], answerIndex: 0, explanation: "Le contexte permet de comprendre les causes, les acteurs et les conséquences." },
              { question: "Pourquoi faut-il comparer plusieurs sources historiques ?", options: ["Pour repérer les nuances", "Pour supprimer les dates", "Pour éviter le contexte", "Pour choisir la plus courte"], answerIndex: 0, explanation: "Les sources peuvent avoir des points de vue, des objectifs et des limites différents." },
              { question: "Que signifie contextualiser un événement ?", options: ["Le replacer dans son époque", "Le raconter sans date", "Le rendre spectaculaire", "Le résumer en un mot"], answerIndex: 0, explanation: "Contextualiser, c’est relier l’événement à son lieu, son époque et ses acteurs." },
              { question: "Une interprétation historique est-elle toujours certaine ?", options: ["Non, elle peut être discutée", "Oui, sans exception", "Seulement si elle est ancienne", "Seulement si elle est courte"], answerIndex: 0, explanation: "Les historiens discutent les interprétations à partir des traces disponibles." },
              { question: "Quelle question aide à analyser un événement ?", options: ["Qui, quand, où et pourquoi ?", "Quelle couleur ?", "Combien de likes ?", "Quel slogan ?"], answerIndex: 0, explanation: "Ces repères structurent une première analyse historique solide." },
            ],
          };
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
