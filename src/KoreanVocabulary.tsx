import { useEffect, useState } from 'react';
import { koreanWordParts } from '../shared/korean-words.mjs';
import { removeWord, reviewWord, saveWord, useVocabulary, vocabularyStorageFailed } from './vocabulary';
import type { VocabWord } from './vocabulary';

type Lookup = Pick<VocabWord, 'ko' | 'zh' | 'hanja'>;
const cache = new Map<string, Lookup>();

function Word({ word, context }: { word: string; context: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Lookup | null>(null);
  const [error, setError] = useState(false);
  const saved = useVocabulary().some(v => v.ko === data?.ko);
  useEffect(() => {
    if (!open) return;
    const key = `${word}\n${context}`;
    const known = cache.get(key);
    if (known) { setData(known); return; }
    const controller = new AbortController();
    setData(null); setError(false);
    const timer = window.setTimeout(() => fetch('/api/korean/word', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ word, context: context.slice(0, 400) }), signal: controller.signal })
      .then(async r => { if (!r.ok) throw Error('lookup failed'); return r.json() as Promise<Lookup>; })
      .then(result => { cache.set(key, result); setData(result); })
      .catch(() => { if (!controller.signal.aborted) setError(true); }), 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, word, context]);
  return <span className="dh-word-wrap" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
    <button type="button" className="dh-word" lang="ko" aria-label={`${word}，查詢單字`} aria-expanded={open} onClick={() => setOpen(true)}>{word}</button>
    {open && <span className="dh-word-card" role="group" aria-label={`${word} 的翻譯`}>
      {error ? <span>暫時無法查詢，請稍後再試。</span> : data ? <><strong lang="ko">{data.ko}</strong><span>{data.zh}</span>{data.hanja && <span>漢字：{data.hanja}</span>}<small>AI 查字建議，漢字請自行核對。</small><button type="button" disabled={saved} onClick={() => saveWord({ ...data, context: context.slice(0, 400) })}>{saved ? '已加入單字庫' : '加入單字庫'}</button></> : <span>查詢中…</span>}
    </span>}
  </span>;
}

export function KoreanText({ text }: { text: string }) {
  return <>{koreanWordParts(text).map((part, i) => part.word ? <Word key={i} word={part.text} context={text} /> : <span key={i}>{part.text}</span>)}</>;
}

export function VocabularySection() {
  const words = useVocabulary();
  const [tab, setTab] = useState<'browse' | 'test'>('browse');
  const [filter, setFilter] = useState('');
  const [question, setQuestion] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const active = words.find(w => w.ko === question) || words[0];
  function next() {
    const candidates = words.filter(w => w.ko !== active?.ko);
    setQuestion((candidates[Math.floor(Math.random() * candidates.length)] || words[0])?.ko || null);
    setRevealed(false);
  }
  return <section className="dh-vocab" aria-labelledby="dh-vocab-title">
    <h2 id="dh-vocab-title">韓文單字庫 <small>{words.length} 個單字</small></h2>
    <div className="dh-vocab-tabs" role="group" aria-label="單字庫功能"><button type="button" aria-pressed={tab === 'browse'} onClick={() => setTab('browse')}>瀏覽單字</button><button type="button" aria-pressed={tab === 'test'} onClick={() => setTab('test')}>單字測驗</button></div>
    <p className="dh-vocab-note">從韓文練習的對話點選或移到韓文單字，即可查意思、漢字並收藏。單字目前只保存在這個瀏覽器。</p>
    {vocabularyStorageFailed() && <p role="alert">瀏覽器儲存失敗，重新整理後可能遺失新增的單字。</p>}
    {!words.length ? <p>單字庫尚無單字。先到韓文練習的對話中收藏一個吧。</p> : tab === 'browse' ? <><input type="search" aria-label="搜尋單字" placeholder="搜尋韓文、中文或漢字" value={filter} onChange={e => setFilter(e.target.value)} /><ul>{words.filter(w => [w.ko, w.zh, w.hanja].some(x => x.includes(filter.trim()))).map(w => <li key={w.ko}><strong lang="ko">{w.ko}</strong><span>{w.zh}</span>{w.hanja && <span>漢字：{w.hanja}</span>}<small>答對 {w.ok} · 待複習 {w.bad}</small><button type="button" onClick={() => removeWord(w.ko)} aria-label={`移除 ${w.ko}`}>移除</button></li>)}</ul></> : active && <div className="dh-vocab-quiz"><p>這個韓文單字是什麼意思？</p><strong lang="ko">{active.ko}</strong>{revealed ? <><p>{active.zh}{active.hanja ? ` · 漢字：${active.hanja}` : ''}</p><div><button type="button" onClick={() => { reviewWord(active.ko, true); next(); }}>答對了</button><button type="button" onClick={() => { reviewWord(active.ko, false); next(); }}>再複習</button></div></> : <button type="button" onClick={() => setRevealed(true)}>顯示答案</button>}</div>}
  </section>;
}
