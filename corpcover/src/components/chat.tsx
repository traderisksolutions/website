"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { localAnswer } from "@/lib/chat-local";
import { site } from "@/site";
import { openStart } from "./start-actions";

/**
 * Chat window in the x.ai/grok style. Two sources of replies:
 * - script: a question and answer the window plays by itself (typed into the composer, sent,
 *   "Thinking", then the answer streams in). Replays whenever the script changes.
 * - the visitor: anything typed goes to /api/chat; when that is not configured or fails, the
 *   matching FAQ or guide answer streams in instead. Once the visitor sends, scripts stop.
 */

type Msg = { role: "user" | "assistant"; text: string; thinking?: boolean; ms?: number; done?: boolean };
export type Script = { id: string; q: string; a: string };

const whatsapp = `https://wa.me/65${site.phone.replace(/\s/g, "")}?text=${encodeURIComponent("Hi, I have a question about business insurance.")}`;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Chat({ script, suggestions, className = "" }: { script?: Script; suggestions?: Script[]; className?: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const run = useRef(0);               // bumps to cancel whatever is playing
  const abort = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false); // scripts wait until the window is on screen

  useEffect(() => { const el = log.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs]);

  const patchLast = (f: (m: Msg) => Msg) => setMsgs(ms => ms.map((m, i) => (i === ms.length - 1 ? f(m) : m)));

  /** Streams text into the last message word by word, as the model would. */
  const typeOut = useCallback(async (text: string, id: number) => {
    if (reduced()) { patchLast(m => ({ ...m, text })); return; }
    const parts = text.split(/(\s+)/);
    for (let i = 0; i < parts.length; i += 2) {
      if (run.current !== id) return;
      const chunk = parts.slice(0, i + 2).join("");
      patchLast(m => ({ ...m, text: chunk }));
      await sleep(22);
    }
  }, []);

  /** A scripted exchange: type, send, think, answer. */
  const play = useCallback(async (s: Script, fresh: boolean) => {
    const id = ++run.current;
    abort.current?.abort();
    setBusy(true);
    if (fresh) setMsgs([]);
    if (!reduced()) {
      for (let i = 1; i <= s.q.length; i++) { if (run.current !== id) return; setDraft(s.q.slice(0, i)); await sleep(24); }
      await sleep(280);
    }
    if (run.current !== id) return;
    setDraft("");
    const t0 = Date.now();
    setMsgs(ms => [...ms, { role: "user", text: s.q }, { role: "assistant", text: "", thinking: true }]);
    await sleep(reduced() ? 0 : 900);
    if (run.current !== id) return;
    patchLast(m => ({ ...m, thinking: false, ms: Date.now() - t0 }));
    await typeOut(s.a, id);
    if (run.current !== id) return;
    patchLast(m => ({ ...m, done: true }));
    setBusy(false);
  }, [typeOut]);

  useEffect(() => {
    const el = root.current;
    if (!el || !script) return;
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [script]);

  useEffect(() => {
    if (!script || live || !seen) return;
    const t = setTimeout(() => void play(script, true), 0); // after paint, so a fast scroll replays only the last question
    return () => clearTimeout(t);
  }, [script, live, seen, play]);
  useEffect(() => () => { run.current++; abort.current?.abort(); }, []);

  /** The visitor's own question: the model when available, else the local answer. */
  async function ask(question: string) {
    const q = question.trim().slice(0, 1000);
    if (!q) return;
    const id = ++run.current;
    setLive(true); setBusy(true); setDraft("");
    const history = [...msgs.filter(m => m.done || m.role === "user"), { role: "user" as const, text: q }];
    const t0 = Date.now();
    setMsgs(ms => [...ms.filter(m => m.done || m.role === "user"), { role: "user", text: q }, { role: "assistant", text: "", thinking: true }]);

    let got = "";
    try {
      const ctl = new AbortController(); abort.current = ctl;
      const res = await fetch("/api/chat", {
        method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: toTurns(history) }),
      });
      if (!res.ok || !res.body) throw new Error(String(res.status));
      const reader = res.body.getReader(); const dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done || run.current !== id) break;
        const chunk = dec.decode(value, { stream: true });
        if (chunk.includes("\u0000")) throw new Error("model");
        if (!got) patchLast(m => ({ ...m, thinking: false, ms: Date.now() - t0 }));
        got += chunk;
        patchLast(m => ({ ...m, text: got }));
      }
      if (!got) throw new Error("empty");
    } catch (e) {
      if (run.current !== id || (e as Error).name === "AbortError") return;
      if (!got) {
        await sleep(500);
        patchLast(m => ({ ...m, thinking: false, ms: Date.now() - t0 }));
        await typeOut(localAnswer(q), id);
      }
    }
    if (run.current !== id) return;
    patchLast(m => ({ ...m, thinking: false, done: true }));
    setBusy(false);
  }

  function stop() { run.current++; abort.current?.abort(); patchLast(m => ({ ...m, thinking: false, done: true })); setBusy(false); }

  const empty = msgs.length === 0;
  const showChips = suggestions && !empty && !busy && !live;

  return (
    <div ref={root} className={`chat flex flex-col overflow-hidden rounded-[28px] border border-rule bg-[#f8f7f6] ${className}`}>
      <div ref={log} className="flex-1 space-y-5 overflow-y-auto px-5 pb-4 pt-6 sm:px-7" aria-live="polite">
        {empty && suggestions && (
          <div className="flex h-full flex-col justify-end gap-1">
            {suggestions.map(s => (
              <button key={s.id} type="button" onClick={() => play(s, true)} className="chat-in flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[0.98rem] text-ink-2 transition-colors hover:bg-white hover:text-ink">
                <svg viewBox="0 0 24 24" aria-hidden className="size-4 shrink-0 text-ink-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>
                {s.q}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => m.role === "user" ? (
          <div key={i} className="chat-in flex justify-end">
            <p className="max-w-[85%] rounded-[22px] border border-rule bg-[#efedeb] px-4 py-2.5 text-[0.98rem] leading-snug">{m.text}</p>
          </div>
        ) : (
          <div key={i} className="chat-in">
            <p className="flex items-center gap-2 text-[0.85rem] text-ink-3">
              <Bulb />
              {m.thinking ? <span className="chat-shimmer">Thinking</span> : <span>Thought for {Math.max(1, Math.round((m.ms ?? 0) / 1000))}s</span>}
            </p>
            {!m.thinking && <Reply text={m.text} />}
            {m.done && i === msgs.length - 1 && live && (
              <div className="chat-in mt-4 flex flex-wrap gap-2">
                <a href={whatsapp} target="_blank" rel="noopener" className="glass-primary px-4 py-2 text-sm font-medium">WhatsApp an adviser</a>
                <button type="button" onClick={() => openStart("callback")} className="glass px-4 py-2 text-sm font-medium">Request a callback</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {showChips && (
        <div className="flex gap-2 overflow-x-auto px-5 pb-3 sm:px-7 [scrollbar-width:none]">
          {suggestions.map(s => (
            <button key={s.id} type="button" onClick={() => play(s, false)} className="glass shrink-0 px-3.5 py-1.5 text-sm">{s.q}</button>
          ))}
        </div>
      )}

      <form onSubmit={e => { e.preventDefault(); if (!busy) void ask(draft); }} className="mx-3 mb-3 flex items-center gap-2 rounded-full border border-rule bg-white py-1.5 pl-5 pr-1.5 shadow-[0_1px_2px_rgba(20,20,24,0.04)] sm:mx-4 sm:mb-4">
        <input
          value={draft}
          onChange={e => { if (!live) { run.current++; setBusy(false); setLive(true); } setDraft(e.target.value); }}
          onFocus={() => { if (!live && busy) { run.current++; setDraft(""); setBusy(false); setLive(true); patchLast(m => ({ ...m, thinking: false, done: true })); } }}
          maxLength={1000}
          placeholder="Ask about business insurance"
          aria-label="Ask about business insurance"
          className="min-w-0 flex-1 bg-transparent py-2 text-[0.98rem] outline-none placeholder:text-ink-3"
        />
        {busy && live
          ? <button type="button" onClick={stop} aria-label="Stop" className="glass-primary grid size-10 shrink-0 place-items-center"><span className="size-3 rounded-[3px] bg-white" /></button>
          : <button type="submit" aria-label="Send" disabled={!draft.trim() || busy} className="glass-primary grid size-10 shrink-0 place-items-center disabled:opacity-40">
              <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" /></svg>
            </button>}
      </form>
    </div>
  );
}

/** What /api/chat accepts: alternating turns that start and end with the visitor, at most 19. */
function toTurns(ms: Msg[]) {
  const out: { role: Msg["role"]; text: string }[] = [];
  for (const m of ms) {
    const text = m.text.trim();
    if (!text) continue;
    const prev = out.at(-1);
    if (prev?.role === m.role) prev.text += `\n\n${text}`;
    else out.push({ role: m.role, text });
  }
  let turns = out.slice(-19);
  if (turns[0]?.role === "assistant") turns = turns.slice(1);
  return turns;
}

/** Plain paragraphs and "- " bullets; markdown emphasis stripped. */
function Reply({ text }: { text: string }) {
  const lines = text.replace(/\*\*/g, "").split("\n").filter(l => l.trim());
  const blocks: (string | string[])[] = [];
  for (const l of lines) {
    const b = l.match(/^\s*[-•]\s+(.*)/);
    if (b) { const prev = blocks.at(-1); if (Array.isArray(prev)) prev.push(b[1]); else blocks.push([b[1]]); }
    else blocks.push(l);
  }
  return (
    <div className="mt-2.5 space-y-2.5 text-[0.98rem] leading-relaxed text-ink">
      {blocks.map((b, i) => typeof b === "string"
        ? <p key={i}>{b}</p>
        : <ul key={i} className="space-y-1.5">{b.map((x, j) => <li key={j} className="flex gap-2.5"><span aria-hidden className="mt-[0.6em] size-1 shrink-0 rounded-full bg-ink-3" /><span className="text-ink-2">{x}</span></li>)}</ul>)}
    </div>
  );
}

const Bulb = () => (
  <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" /></svg>
);
