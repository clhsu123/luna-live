import { useSyncExternalStore } from 'react';

export type VocabWord = { ko: string; zh: string; hanja: string; context: string; added: string; ok: number; bad: number };
const KEY = 'luna.korean-vocabulary.v1';
function valid(value: unknown): value is VocabWord {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<VocabWord>;
  return typeof v.ko === 'string' && /^[\uac00-\ud7a3\s]{1,80}$/.test(v.ko) && typeof v.zh === 'string' && v.zh.length <= 300;
}
function read(): VocabWord[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(data) ? data.filter(valid).slice(0, 500).map(v => ({ ...v, hanja: typeof v.hanja === 'string' ? v.hanja : '', context: typeof v.context === 'string' ? v.context : '', added: typeof v.added === 'string' ? v.added : '', ok: Number.isSafeInteger(v.ok) ? v.ok : 0, bad: Number.isSafeInteger(v.bad) ? v.bad : 0 })) : [];
  } catch { return []; }
}
let current = read();
let failed = false;
const listeners = new Set<() => void>();
function notify() { listeners.forEach(fn => fn()); }
window.addEventListener('storage', e => { if (e.key === KEY || e.key === null) { current = read(); notify(); } });
function update(next: VocabWord[]) {
  current = next;
  try { localStorage.setItem(KEY, JSON.stringify(current)); failed = false; } catch { failed = true; }
  notify();
}
export function useVocabulary() { return useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => current); }
export function vocabularyStorageFailed() { return failed; }
export function saveWord(word: Pick<VocabWord, 'ko' | 'zh' | 'hanja' | 'context'>) {
  if (!valid(word) || current.some(v => v.ko === word.ko)) return false;
  update([{ ...word, added: new Date().toISOString(), ok: 0, bad: 0 }, ...current].slice(0, 500));
  return true;
}
export function removeWord(ko: string) { update(current.filter(v => v.ko !== ko)); }
export function reviewWord(ko: string, correct: boolean) { update(current.map(v => v.ko === ko ? { ...v, ok: v.ok + Number(correct), bad: v.bad + Number(!correct) } : v)); }
