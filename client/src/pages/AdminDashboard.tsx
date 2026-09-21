import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Activity, ArrowLeft, Clock3, Copy, Database, ExternalLink, Globe2, LogOut, Monitor, RefreshCw, ShieldCheck, Smartphone, Tablet, Users, Wifi } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

function formatDate(value: Date | string) {
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" });
}

function deviceIcon(device: string) {
  if (device === "iphone" || device === "android") return <Smartphone className="size-4" />;
  if (device === "ipad" || device === "tablet") return <Tablet className="size-4" />;
  return <Monitor className="size-4" />;
}

export default function AdminDashboard() {
  const session = trpc.admin.session.useQuery();
  const dashboard = trpc.tracking.dashboard.useQuery(undefined, {
    enabled: Boolean(session.data?.authorized),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
  const logout = trpc.admin.logout.useMutation({ onSuccess: () => session.refetch() });
  const copyId = async (id: string) => { await navigator.clipboard.writeText(id); toast.success("Identifiant copié"); };

  if (session.isLoading) return <div className="admin-page"><div className="admin-loading">Vérification de l’accès administrateur…</div></div>;
  if (!session.data?.authorized) return <div className="admin-page"><div className="admin-denied"><ShieldCheck className="mx-auto size-8 text-rose-300" /><h1>Accès refusé</h1><p>Cette console est réservée au compte administrateur Historia.</p><Link href="/settings"><Button variant="outline" className="mt-5 rounded-none">Se connecter</Button></Link></div></div>;

  const data = dashboard.data;
  return <div className="admin-page"><header className="admin-header"><div className="container flex items-center justify-between gap-4"><div className="flex items-center gap-3"><span className="brand-mark"><ShieldCheck className="size-5" /></span><div><div className="font-display text-lg font-bold tracking-[.13em] text-white">HISTORIA / ADMIN</div><div className="font-mono text-[9px] uppercase tracking-[.16em] text-cyan-300/60">Console privée · suivi anonymisé</div></div></div><div className="flex items-center gap-2"><span className="hidden font-mono text-[10px] uppercase tracking-[.12em] text-white/45 sm:inline">{session.data.username}</span><Button variant="ghost" size="icon" className="text-white/60 hover:bg-white/10" onClick={() => logout.mutate()} title="Se déconnecter"><LogOut className="size-4" /></Button></div></div></header>
    <main className="container py-8 md:py-12"><div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><Link href="/" className="mb-4 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.14em] text-cyan-300/70 hover:text-cyan-200"><ArrowLeft className="size-3" /> Retour au site</Link><h1 className="font-display text-4xl font-bold tracking-[-.04em] text-white md:text-5xl">Centre de contrôle.</h1><p className="mt-2 max-w-xl text-sm text-slate-300/60">Les visiteurs saisissent eux-mêmes un code de leur choix. Aucun nom, e-mail ou identifiant automatique n’est demandé.</p></div><Button variant="outline" className="w-fit rounded-none border-white/15 font-mono text-[10px] uppercase tracking-[.12em] text-white/70" onClick={() => dashboard.refetch()}><RefreshCw className={`mr-2 size-3.5 ${dashboard.isFetching ? "animate-spin" : ""}`} />Actualiser</Button></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric icon={<Activity className="size-4" />} label="Visiteurs actifs" value={String(data?.activeVisitors ?? 0).padStart(2, "0")} accent="cyan" detail="activité sur 2 minutes" /><Metric icon={<Users className="size-4" />} label="Navigateurs connus" value={String(data?.totalVisitors ?? 0).padStart(2, "0")} accent="fuchsia" detail="identifiants anonymes uniques" /><Metric icon={<Wifi className="size-4" />} label="État du site" value="EN LIGNE" accent="lime" detail="serveur répondant" /><Metric icon={<Database className="size-4" />} label="Actualisation" value="15 s" accent="amber" detail="rafraîchissement automatique" /></div>
      <div className="mt-8 grid gap-5 lg:grid-cols-[1.4fr_.6fr]"><section className="admin-card overflow-hidden"><div className="admin-card-head"><div><h2>Présence en temps réel</h2><p>Les codes sont saisis volontairement par les visiteurs.</p></div><Badge className="rounded-none border border-lime-300/30 bg-lime-300/10 font-mono text-[9px] uppercase tracking-[.12em] text-lime-200"><span className="mr-1.5 inline-block size-1.5 rounded-full bg-lime-300" />Live</Badge></div>{dashboard.isLoading ? <div className="admin-empty">Chargement des visiteurs…</div> : data?.visitors.length ? <div className="overflow-x-auto"><table className="admin-table"><thead><tr><th>Identifiant</th><th>Statut</th><th>Appareil</th><th>Dernière activité</th><th>Page</th></tr></thead><tbody>{data.visitors.map((visitor) => <tr key={visitor.visitorId}><td><button className="group inline-flex items-center gap-2 font-mono text-xs text-cyan-200 hover:text-cyan-100" onClick={() => copyId(visitor.visitorId)}>{visitor.visitorId}<Copy className="size-3 opacity-0 transition-opacity group-hover:opacity-100" /></button></td><td><span className={`inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[.1em] ${visitor.isOnline ? "text-lime-200" : "text-white/35"}`}><span className={`size-1.5 rounded-full ${visitor.isOnline ? "bg-lime-300" : "bg-white/25"}`} />{visitor.isOnline ? "En ligne" : "Inactif"}</span></td><td><span className="inline-flex items-center gap-2 text-xs text-white/55">{deviceIcon(visitor.device)}{visitor.device}</span></td><td className="whitespace-nowrap text-xs text-white/45">{formatDate(visitor.lastSeen)}</td><td className="max-w-[160px] truncate font-mono text-[10px] text-white/35">{visitor.currentPage}</td></tr>)}</tbody></table></div> : <div className="admin-empty"><Globe2 className="mx-auto mb-3 size-6 text-white/25" /><p>Aucun visiteur enregistré pour l’instant.</p><span>Ouvre le site dans un autre onglet pour voir apparaître son code.</span></div>}</section>
        <aside className="admin-card"><div className="admin-card-head"><div><h2>Déploiement</h2><p>État de la version active</p></div><ExternalLink className="size-4 text-cyan-300/60" /></div><div className="deploy-status"><span className="status-dot" /><div><strong>Version Historia active</strong><span>Serveur de production disponible</span></div></div><div className="admin-info-row"><span><Clock3 className="size-3.5" />Dernier contrôle</span><strong>Automatique</strong></div><div className="admin-info-row"><span><Activity className="size-3.5" />Collecte</span><strong>Identifiants seuls</strong></div><div className="admin-info-row"><span><ShieldCheck className="size-3.5" />Vie privée</span><strong>Aucun nom demandé</strong></div><div className="mt-5 border-t border-white/10 pt-4 font-mono text-[9px] leading-relaxed text-white/35">Les données affichées sont des signaux techniques anonymisés. L’identifiant est créé localement dans le navigateur et ne révèle pas l’identité réelle du visiteur.</div></aside></div>
    </main></div>;
}

function Metric({ icon, label, value, accent, detail }: { icon: React.ReactNode; label: string; value: string; accent: string; detail: string }) { return <div className="admin-metric"><span className={`metric-icon metric-${accent}`}>{icon}</span><span className="font-mono text-[9px] uppercase tracking-[.14em] text-white/40">{label}</span><strong className={`metric-value text-${accent}-200`}>{value}</strong><span className="text-[10px] text-white/35">{detail}</span></div>; }
