import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const STORAGE_KEY = "historia-visitor-code";

function getDevice() {
  const width = window.innerWidth;
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("ipad") || (ua.includes("macintosh") && "ontouchend" in document)) return "ipad" as const;
  if (ua.includes("iphone")) return "iphone" as const;
  if (ua.includes("android") && width < 600) return "android" as const;
  if (ua.includes("android")) return "tablet" as const;
  if (width < 600) return "iphone" as const;
  return "desktop" as const;
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32);
}

export default function VisitorTracker() {
  const isAdminArea = typeof window !== "undefined" && (window.location.pathname === "/settings" || window.location.pathname.startsWith("/admin"));
  const [visitorId, setVisitorId] = useState(() => localStorage.getItem(STORAGE_KEY) ?? "");
  const [draft, setDraft] = useState("");
  const touch = trpc.tracking.touch.useMutation();

  useEffect(() => {
    if (isAdminArea || !visitorId) return;
    const sendHeartbeat = () => touch.mutate({ visitorId, currentPage: window.location.pathname, device: getDevice() });
    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, 15_000);
    const onVisibility = () => { if (document.visibilityState === "visible") sendHeartbeat(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisibility); };
  }, [isAdminArea, visitorId]);

  const submitCode = (event: React.FormEvent) => {
    event.preventDefault();
    const code = normalizeCode(draft);
    if (code.length < 4) { toast.error("Saisissez au moins 4 caractères."); return; }
    localStorage.setItem(STORAGE_KEY, code);
    setVisitorId(code);
  };

  if (isAdminArea || visitorId) return null;
  return <div className="visitor-code-overlay"><div className="visitor-code-card"><span className="visitor-code-icon"><KeyRound className="size-5" /></span><div className="eyebrow mb-4"><span className="eyebrow-line" /><span>Accès visiteur / identification technique</span></div><h1 className="font-display text-3xl font-bold tracking-[-.04em] text-white">Choisissez votre code.</h1><p className="mt-4 text-sm leading-relaxed text-slate-300/70">Saisissez un code court de votre choix pour être reconnu dans la console administrateur. N’utilisez pas votre nom, votre e-mail ou une information personnelle.</p><form onSubmit={submitCode} className="mt-6 flex flex-col gap-3"><Input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ex. ARCHIVE-7K4P" autoComplete="off" className="h-12 rounded-none border-cyan-300/30 bg-white/[.04] font-mono text-sm uppercase tracking-[.16em] text-white placeholder:text-white/25" /><Button type="submit" className="h-11 rounded-none bg-cyan-300 font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#07131b] hover:bg-cyan-200"><ShieldCheck className="mr-2 size-4" />Entrer dans Historia</Button></form><p className="mt-4 font-mono text-[9px] uppercase tracking-[.12em] text-white/30">Ce code reste enregistré uniquement dans ce navigateur.</p></div></div>;
}
