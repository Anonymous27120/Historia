import { AIChatBox, type Message } from "@/components/AIChatBox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  ArrowUpRight, Atom, BookOpen, Brain, Check, ChevronRight, Clock3, Command,
  Copy, ExternalLink, Filter, Flame, Globe2, GraduationCap, Heart, History,
  Library, Menu, Mic, Network, Radio, Search, Share2, ShieldCheck, Sparkles,
  Square, Star, Triangle, Volume2, Wifi, X, Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

const audienceOptions = [
  { id: "curieux", label: "Curieux", icon: <Globe2 className="size-3.5" /> },
  { id: "enfant", label: "Enfant", icon: <Star className="size-3.5" /> },
  { id: "etudiant", label: "Étudiant", icon: <GraduationCap className="size-3.5" /> },
  { id: "passionne", label: "Passionné", icon: <Brain className="size-3.5" /> },
] as const;

type Audience = (typeof audienceOptions)[number]["id"];
type SavedAnswer = { id: string; question: string; answer: string; createdAt: string };

type Era = { label: string; years: string; accent: string; icon: string; tags: string[]; prompt: string };
const eras: Era[] = [
  { label: "Antiquité", years: "-3500 → 476", accent: "cyan", icon: "𐤀", tags: ["civilisations", "Rome", "Grèce"], prompt: "Explique-moi les grandes civilisations de l’Antiquité." },
  { label: "Moyen Âge", years: "476 → 1453", accent: "violet", icon: "✦", tags: ["religions", "royaumes", "échanges"], prompt: "Comment les échanges ont-ils transformé le Moyen Âge ?" },
  { label: "Temps modernes", years: "1453 → 1789", accent: "magenta", icon: "◈", tags: ["explorations", "empires", "révolutions"], prompt: "Pourquoi les Temps modernes ont-ils changé la carte du monde ?" },
  { label: "Époque contemporaine", years: "1789 → aujourd’hui", accent: "lime", icon: "⌁", tags: ["sociétés", "guerres", "technologies"], prompt: "Quels sont les grands tournants de l’époque contemporaine ?" },
];

const starterPrompts = ["Pourquoi l’Empire romain s’est-il divisé ?", "Raconte-moi la route de la soie", "Qui était Aimé Césaire ?", "Comment est née la démocratie ?"];
const baseSystem: Message = { role: "system", content: "Historia est une IA d’histoire mondiale. Réponds avec rigueur, pédagogie, nuance et contexte." };
const welcome: Message = { role: "assistant", content: "## Signal reçu. Bienvenue dans les archives.\n\nJe suis **Historia**, votre guide à travers les temps. Choisissez un profil, activez la recherche documentaire puis posez-moi une question sur un pays, une période, une personne ou un événement.\n\n*Quelle trace du passé souhaitez-vous explorer ?*" };

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([baseSystem, welcome]);
  const [audience, setAudience] = useState<Audience>("curieux");
  const [useResearch, setUseResearch] = useState(true);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [queryCount, setQueryCount] = useState(0);
  const [savedAnswers, setSavedAnswers] = useState<SavedAnswer[]>([]);
  const [selectedEra, setSelectedEra] = useState("Toutes");
  const [quizTopic, setQuizTopic] = useState("La Révolution française");
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [selectedQuizAnswer, setSelectedQuizAnswer] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const askMutation = trpc.history.ask.useMutation();
  const quizMutation = trpc.history.quiz.useMutation();

  useEffect(() => {
    try { setSavedAnswers(JSON.parse(localStorage.getItem("historia-saved") ?? "[]")); } catch { setSavedAnswers([]); }
  }, []);
  useEffect(() => { localStorage.setItem("historia-saved", JSON.stringify(savedAnswers)); }, [savedAnswers]);

  const displayCount = useMemo(() => String(queryCount).padStart(2, "0"), [queryCount]);
  const currentAnswer = [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";
  const currentQuestion = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";

  const handleSend = (content: string) => {
    const nextMessages = [...messages, { role: "user" as const, content }];
    const apiMessages = nextMessages.filter((message): message is Message & { role: "user" | "assistant" } => message.role !== "system").slice(-12).map(({ role, content: text }) => ({ role, content: text }));
    setMessages(nextMessages); setQueryCount((count) => count + 1);
    askMutation.mutate({ messages: apiMessages, audience, useResearch }, {
      onSuccess: (result) => {
        const sourceBlock = result.sources?.length ? `\n\n---\n**Sources consultées**\n${result.sources.map((source) => `- [${source.title}](${source.url})`).join("\n")}` : "";
        const answer = `${result.answer}${sourceBlock}`;
        setMessages((current) => [...current, { role: "assistant", content: answer }]);
        const saved: SavedAnswer = { id: crypto.randomUUID(), question: content, answer, createdAt: new Date().toISOString() };
        setSavedAnswers((current) => [saved, ...current].slice(0, 30));
      },
      onError: (error) => {
        const quotaMessage = error.message.toLowerCase().includes("quota") || error.message.toLowerCase().includes("usage exhausted");
        setMessages((current) => [...current, { role: "assistant", content: quotaMessage ? "## Quota temporairement épuisé\n\nHistoria ne peut pas générer cette réponse pour le moment, car son quota d’analyse est épuisé. Réessayez plus tard." : "## Connexion interrompue\n\nLe module d’analyse n’a pas répondu. Réessayez dans un instant." }]);
      },
    });
  };

  const toggleFavorite = () => {
    if (!currentQuestion || !currentAnswer) return;
    const exists = savedAnswers.some((item) => item.question === currentQuestion && item.answer === currentAnswer);
    if (exists) { setSavedAnswers((current) => current.filter((item) => !(item.question === currentQuestion && item.answer === currentAnswer))); toast.success("Retiré des favoris"); }
    else { setSavedAnswers((current) => [{ id: crypto.randomUUID(), question: currentQuestion, answer: currentAnswer, createdAt: new Date().toISOString() }, ...current]); toast.success("Réponse ajoutée aux favoris"); }
  };

  const shareAnswer = async () => {
    const text = `${currentQuestion}\n\n${currentAnswer.replace(/\[[^\]]+\]\([^)]*\)/g, "")}`;
    try { if (navigator.share) await navigator.share({ title: "Historia — archive partagée", text }); else { await navigator.clipboard.writeText(text); toast.success("Réponse copiée dans le presse-papiers"); } } catch { /* cancelled */ }
  };

  // Voice input is disabled in this deployment (no transcription backend configured).
  const startRecording = async () => { toast.error("La saisie vocale est désactivée sur ce déploiement."); };
  const stopRecording = () => { setIsRecording(false); };

  const generateQuiz = () => {
    quizMutation.mutate({ topic: quizTopic, audience }, { onSuccess: (result) => { setQuiz(result); setQuizIndex(0); setQuizScore(0); setSelectedQuizAnswer(null); }, onError: () => toast.error("Impossible de générer ce quiz pour le moment.") });
  };
  const answerQuiz = (index: number) => { if (selectedQuizAnswer !== null || !quiz) return; setSelectedQuizAnswer(index); if (index === quiz.questions[quizIndex].answerIndex) setQuizScore((score) => score + 1); };
  const nextQuiz = () => { if (!quiz) return; if (quizIndex < quiz.questions.length - 1) { setQuizIndex((index) => index + 1); setSelectedQuizAnswer(null); } else { toast.success(`Quiz terminé : ${quizScore}/${quiz.questions.length}`); } };

  const filteredEras = selectedEra === "Toutes" ? eras : eras.filter((era) => era.label === selectedEra);
  const scrollToChat = () => document.getElementById("historia-chat")?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="historia-shell min-h-screen overflow-x-hidden"><div className="scanlines" aria-hidden="true" /><div className="noise" aria-hidden="true" />
      <header className="relative z-20 border-b border-white/10 bg-[#090d18]/80 backdrop-blur-xl"><div className="container flex h-[74px] items-center justify-between gap-6">
        <a href="#top" className="flex items-center gap-3" aria-label="Historia, accueil"><span className="brand-mark"><Atom className="size-5" /></span><span className="flex flex-col leading-none"><span className="font-display text-[19px] font-bold tracking-[0.15em] text-white">HISTORIA</span><span className="mt-1 font-mono text-[9px] uppercase tracking-[0.32em] text-cyan-300/70">archives of human time</span></span></a>
        <nav className={`${isNavOpen ? "nav-mobile-open" : "nav-mobile-closed"} historia-nav`} aria-label="Navigation principale"><a href="#explorer" onClick={() => setIsNavOpen(false)}>Explorer</a><a href="#quiz" onClick={() => setIsNavOpen(false)}>Quiz</a><a href="#archive-map" onClick={() => setIsNavOpen(false)}>Chronologie</a><a href="#saved" onClick={() => setIsNavOpen(false)}>Favoris</a><a href="/settings" onClick={() => setIsNavOpen(false)}>Paramètres</a></nav>
        <div className="flex items-center gap-3"><div className="hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-white/50 md:flex"><span className="status-dot" /> Système en ligne</div><Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-cyan-300 md:hidden" onClick={() => setIsNavOpen((open) => !open)} aria-label="Menu">{isNavOpen ? <X className="size-5" /> : <Menu className="size-5" />}</Button><Button className="hidden rounded-none border border-cyan-300/40 bg-cyan-300/10 font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-200 hover:bg-cyan-300/20 sm:flex" onClick={() => document.getElementById("archive-map")?.scrollIntoView({ behavior: "smooth" })}><Command className="mr-2 size-3.5" />Ouvrir la carte</Button></div>
      </div></header>

      <main id="top" className="relative z-10">
        <section id="explorer" className="container relative grid gap-10 pb-16 pt-16 lg:grid-cols-[minmax(0,0.85fr)_minmax(500px,1.15fr)] lg:items-start lg:gap-14 lg:pb-20 lg:pt-24">
          <div className="relative pt-2"><div className="eyebrow mb-7"><span className="eyebrow-line" /><span>Interface de connaissance / 01</span></div><h1 className="font-display max-w-[720px] text-[clamp(3.2rem,7vw,6.8rem)] font-bold leading-[0.9] tracking-[-0.055em] text-white">Le passé n’est<br /><span className="text-gradient-cyan">jamais</span> hors-ligne.</h1><p className="mt-8 max-w-[560px] text-lg leading-relaxed text-slate-300/80 md:text-xl">Historia transforme les archives du monde en réponses compréhensibles. Une IA pour relier les époques, les cultures et les idées — sans perdre la nuance.</p><div className="mt-10 flex flex-wrap gap-3"><Button className="group rounded-none bg-cyan-300 px-5 py-5 font-mono text-xs font-bold uppercase tracking-[0.15em] text-[#07131b] hover:bg-cyan-200" onClick={scrollToChat}><Search className="mr-2 size-4" />Interroger Historia<ArrowUpRight className="ml-2 size-4" /></Button><Button variant="outline" className="rounded-none border-white/15 bg-white/[0.03] px-5 py-5 font-mono text-xs uppercase tracking-[0.15em] text-slate-300 hover:border-fuchsia-300/50 hover:bg-fuchsia-300/10" onClick={() => document.getElementById("quiz")?.scrollIntoView({ behavior: "smooth" })}><Flame className="mr-2 size-4" />Lancer un quiz</Button></div><div className="mt-14 grid max-w-[560px] grid-cols-3 gap-3 border-y border-white/10 py-5"><Stat value="∞" label="Questions possibles" /><Stat value={displayCount} label="Requêtes de session" accent="cyan" /><Stat value={String(savedAnswers.length).padStart(2, "0")} label="Archives sauvegardées" accent="magenta" /></div></div>

          <div id="historia-chat" className="relative"><div className="corner-bracket corner-bracket-tl" /><div className="corner-bracket corner-bracket-br" /><div className="mb-3 flex items-center justify-between px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/45"><span className="flex items-center gap-2"><Radio className="size-3.5 text-cyan-300" /> Canal Historia / conversation active</span><span className="text-fuchsia-300/70">ID: HOEL-001</span></div><div className="historia-chat-frame"><div className="flex items-center justify-between border-b border-white/10 bg-white/[0.025] px-5 py-3"><div className="flex items-center gap-3"><span className="ai-orb"><Sparkles className="size-4" /></span><div><div className="font-display text-sm font-bold tracking-[0.1em] text-white">HISTORIA <span className="font-mono text-[10px] font-normal text-cyan-300/65">/ AI CORE</span></div><div className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/40">archive reasoning engine · v2.0</div></div></div><div className="hidden items-center gap-2 font-mono text-[9px] uppercase tracking-[0.16em] text-cyan-200/60 sm:flex"><Wifi className="size-3" /> Recherche sourcée</div></div>
            <div className="border-b border-white/10 bg-[#09111e] px-4 py-3"><div className="mb-2 flex items-center justify-between"><span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/40">Profil de transmission</span><span className="font-mono text-[9px] uppercase tracking-[0.14em] text-cyan-300/60">{useResearch ? "Sources ON" : "Sources OFF"}</span></div><div className="flex flex-wrap gap-1.5">{audienceOptions.map((option) => <button key={option.id} onClick={() => setAudience(option.id)} className={`audience-chip ${audience === option.id ? "audience-active" : ""}`}>{option.icon}{option.label}</button>)}<button onClick={() => setUseResearch((value) => !value)} className={`audience-chip ml-auto ${useResearch ? "research-active" : ""}`}><BookOpen className="size-3.5" />Recherche</button></div></div>
            <AIChatBox messages={messages} onSendMessage={handleSend} isLoading={askMutation.isPending} height="470px" placeholder="Posez une question d’histoire…" emptyStateMessage="Le canal est prêt. Quelle époque souhaitez-vous ouvrir ?" suggestedPrompts={starterPrompts} className="historia-chatbox" />
            <div className="flex items-center justify-between border-t border-white/10 bg-[#07101b] px-4 py-2.5"><span className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">{isRecording ? "Écoute active…" : "Voix ou texte"}</span><div className="flex gap-1.5"><Button size="icon-sm" variant="ghost" title={isRecording ? "Arrêter l’enregistrement" : "Poser une question vocale"} className={isRecording ? "text-rose-300 hover:bg-rose-300/10" : "text-cyan-300 hover:bg-cyan-300/10"} onClick={isRecording ? stopRecording : startRecording}>{isRecording ? <Square className="size-3.5 fill-current" /> : <Mic className="size-3.5" />}</Button><Button size="icon-sm" variant="ghost" title="Lire la dernière réponse" className="text-fuchsia-300 hover:bg-fuchsia-300/10" onClick={() => speak(currentAnswer)}><Volume2 className="size-3.5" /></Button></div></div>
          </div><div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1"><span className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.16em] text-white/35"><ShieldCheck className="size-3 text-lime-300/70" /> Réponses nuancées · tout public</span><div className="flex gap-1.5"><Button variant="ghost" size="sm" className="h-7 rounded-none px-2 font-mono text-[9px] uppercase tracking-[0.1em] text-white/45 hover:text-cyan-200" onClick={toggleFavorite}><Heart className="mr-1 size-3" />Favori</Button><Button variant="ghost" size="sm" className="h-7 rounded-none px-2 font-mono text-[9px] uppercase tracking-[0.1em] text-white/45 hover:text-fuchsia-200" onClick={shareAnswer}><Share2 className="mr-1 size-3" />Partager</Button></div></div></div>
        </section>

        <section id="quiz" className="border-y border-white/10 bg-[#0c1220]/70 py-16 md:py-20"><div className="container grid gap-10 lg:grid-cols-[.75fr_1.25fr] lg:items-center"><div><div className="eyebrow mb-5"><span className="eyebrow-line" /><span>Laboratoire de quiz / 02</span></div><h2 className="font-display text-4xl font-bold leading-[.95] tracking-[-.04em] text-white md:text-5xl">Testez vos<br /><span className="text-gradient-cyan">repères.</span></h2><p className="mt-5 max-w-lg text-base leading-relaxed text-slate-300/65">Historia compose cinq questions adaptées à votre profil. Idéal pour réviser, jouer en famille ou ouvrir un nouveau sujet.</p><div className="mt-7 flex gap-2"><Input value={quizTopic} onChange={(event) => setQuizTopic(event.target.value)} onKeyDown={(event) => event.key === "Enter" && generateQuiz()} className="h-10 rounded-none border-white/15 bg-white/[.04] font-mono text-xs text-white" placeholder="Sujet du quiz" /><Button className="h-10 shrink-0 rounded-none bg-fuchsia-300 px-4 font-mono text-[10px] uppercase tracking-[.12em] text-[#1d0d24] hover:bg-fuchsia-200" onClick={generateQuiz} disabled={quizMutation.isPending}><Flame className="mr-1.5 size-3.5" />Générer</Button></div></div><div className="quiz-panel">{quiz ? <div><div className="mb-5 flex items-center justify-between"><div><Badge className="rounded-none border border-fuchsia-300/30 bg-fuchsia-300/10 font-mono text-[9px] uppercase tracking-[.14em] text-fuchsia-200">Question {quizIndex + 1}/{quiz.questions.length}</Badge><h3 className="mt-3 font-display text-xl font-bold text-white">{quiz.title}</h3></div><div className="font-mono text-sm text-cyan-300">{quizScore} pts</div></div><p className="text-lg leading-relaxed text-slate-100">{quiz.questions[quizIndex].question}</p><div className="mt-5 grid gap-2">{quiz.questions[quizIndex].options.map((option, index) => <button key={option} className={`quiz-option ${selectedQuizAnswer !== null ? index === quiz.questions[quizIndex].answerIndex ? "quiz-correct" : index === selectedQuizAnswer ? "quiz-wrong" : "" : ""}`} onClick={() => answerQuiz(index)}><span>{String.fromCharCode(65 + index)}</span>{option}{selectedQuizAnswer !== null && index === quiz.questions[quizIndex].answerIndex && <Check className="ml-auto size-4" />}</button>)}</div>{selectedQuizAnswer !== null && <div className="mt-5 border-l-2 border-cyan-300/50 pl-3 text-sm leading-relaxed text-slate-300/70">{quiz.questions[quizIndex].explanation}</div>}<Button variant="outline" className="mt-6 rounded-none border-white/15 font-mono text-[10px] uppercase tracking-[.13em] text-white/70" disabled={selectedQuizAnswer === null} onClick={nextQuiz}>{quizIndex === quiz.questions.length - 1 ? "Terminer" : "Question suivante"}<ChevronRight className="ml-1 size-3.5" /></Button></div> : <div className="flex min-h-[250px] flex-col items-center justify-center text-center"><span className="feature-icon mb-4"><Brain className="size-5" /></span><p className="font-display text-xl font-bold text-white">Aucun quiz ouvert</p><p className="mt-2 max-w-sm text-sm text-slate-300/55">Choisissez un sujet puis générez votre prochaine mission de mémoire.</p></div>}</div></div></section>

        <section id="archive-map" className="container py-16 md:py-24"><div className="flex flex-col justify-between gap-6 md:flex-row md:items-end"><div><div className="eyebrow mb-5"><span className="eyebrow-line" /><span>Carte temporelle / 03</span></div><h2 className="font-display text-4xl font-bold tracking-[-.04em] text-white md:text-5xl">Où commence votre exploration ?</h2></div><div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.17em] text-white/40"><Clock3 className="size-3.5 text-fuchsia-300" /> Ligne du temps interactive</div></div><div className="mt-8 flex flex-wrap gap-2"><button className={`era-filter ${selectedEra === "Toutes" ? "era-filter-active" : ""}`} onClick={() => setSelectedEra("Toutes")}><Filter className="size-3.5" />Toutes les ères</button>{eras.map((era) => <button key={era.label} className={`era-filter ${selectedEra === era.label ? "era-filter-active" : ""}`} onClick={() => setSelectedEra(era.label)}>{era.icon} {era.label}</button>)}</div><div className="relative mt-10 grid gap-3 md:grid-cols-4"><div className="timeline-track" aria-hidden="true" />{filteredEras.map((era) => <EraCard key={era.label} era={era} onExplore={() => handleSend(era.prompt)} />)}</div></section>

        <section id="saved" className="border-y border-white/10 bg-[#0c1220]/70 py-16"><div className="container"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="eyebrow mb-5"><span className="eyebrow-line" /><span>Bibliothèque personnelle / 04</span></div><h2 className="font-display text-4xl font-bold tracking-[-.04em] text-white">Vos archives sauvegardées.</h2></div><div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.15em] text-white/40"><History className="size-3.5 text-cyan-300" /> Conservées dans ce navigateur</div></div>{savedAnswers.length ? <div className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{savedAnswers.slice(0, 6).map((item) => <button key={item.id} className="saved-card text-left" onClick={() => { setMessages([baseSystem, { role: "user", content: item.question }, { role: "assistant", content: item.answer }]); scrollToChat(); }}><div className="flex items-center justify-between"><BookOpen className="size-4 text-cyan-300" /><span className="font-mono text-[9px] uppercase tracking-[.12em] text-white/35">{new Date(item.createdAt).toLocaleDateString("fr-FR")}</span></div><p className="mt-5 line-clamp-2 font-display text-base font-bold text-white">{item.question}</p><p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-300/50">{item.answer.replace(/[#*_]/g, "").slice(0, 140)}…</p><ChevronRight className="mt-5 size-4 text-cyan-300/70" /></button>)}</div> : <div className="mt-8 border border-dashed border-white/15 p-8 text-center"><Library className="mx-auto size-6 text-white/30" /><p className="mt-3 font-mono text-[10px] uppercase tracking-[.15em] text-white/40">Vos réponses favorites apparaîtront ici</p></div>}</div></section>

        <section id="method" className="border-t border-white/10 bg-[#080b14] py-14"><div className="container flex flex-col gap-6 md:flex-row md:items-center md:justify-between"><div className="flex items-center gap-4"><span className="brand-mark small"><Library className="size-4" /></span><div><p className="font-display text-sm font-bold tracking-[.14em] text-white">HISTORIA <span className="text-cyan-300">/</span> BY HOEL</p><p className="mt-1 font-mono text-[10px] uppercase tracking-[.16em] text-white/40">Une interface pour apprendre, questionner, transmettre.</p></div></div><div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-[.14em] text-white/35"><span className="flex items-center gap-2"><Triangle className="size-3 text-fuchsia-300" /> Design cyberpunk pédagogique</span><span className="flex items-center gap-2"><Zap className="size-3 text-cyan-300" /> Propulsé par une IA</span></div></div></section>
      </main>
    </div>
  );
}

type Quiz = { title: string; questions: Array<{ question: string; options: string[]; answerIndex: number; explanation: string }> };
function Stat({ value, label, accent = "white" }: { value: string; label: string; accent?: string }) { return <div><div className={`font-display text-2xl font-bold text-${accent === "white" ? "white" : `${accent}-300`}`}>{value}</div><div className="mt-1 font-mono text-[9px] uppercase tracking-[.18em] text-white/45">{label}</div></div>; }
function EraCard({ era, onExplore }: { era: Era; onExplore: () => void }) { return <button className={`era-card era-${era.accent} group text-left`} onClick={onExplore}><div className="relative z-10 flex items-start justify-between"><span className="era-symbol">{era.icon}</span><ArrowUpRight className="size-4 opacity-40 transition-all group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:opacity-100" /></div><div className="relative z-10 mt-10"><div className="font-display text-xl font-bold text-white">{era.label}</div><div className="mt-2 font-mono text-[10px] uppercase tracking-[.16em] text-white/40">{era.years}</div><div className="mt-4 flex flex-wrap gap-1">{era.tags.map((tag) => <span key={tag} className="rounded-full border border-white/10 px-2 py-1 font-mono text-[8px] uppercase tracking-[.1em] text-white/40">{tag}</span>)}</div></div><span className="era-cta">Interroger cette ère</span></button>; }
function speak(text: string) { if (typeof window !== "undefined" && "speechSynthesis" in window) { window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text.replace(/[#*_\[\]()]/g, " ")); utterance.lang = "fr-FR"; utterance.rate = .95; window.speechSynthesis.speak(utterance); } }
