import { useSyncExternalStore } from 'react';
import type { SetStateAction } from 'react';
import { MEMORY_KEY, normalizeHistory, type MemoryEntry } from '../shared/memory.mjs';
function read(): MemoryEntry[] {
  try { return normalizeHistory(JSON.parse(localStorage.getItem(MEMORY_KEY) || '[]')); } catch { return []; }
}
let current = read();
const listeners = new Set<() => void>();
let storageFailed = false;
function notify() { listeners.forEach(fn => fn()); }
window.addEventListener('storage', e => { if (e.key === MEMORY_KEY || e.key === null) { current = read(); notify(); } });
export function updateMemory(update: SetStateAction<MemoryEntry[]>) {
  current = normalizeHistory(typeof update === 'function' ? update(current) : update);
  try { localStorage.setItem(MEMORY_KEY, JSON.stringify(current)); storageFailed = false; } catch { storageFailed = true; }
  notify();
}
export function useSharedMemory(): [MemoryEntry[], typeof updateMemory] {
  const entries = useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => current);
  return [entries, updateMemory];
}
export function getMemory() { return current; }
export function memoryStorageFailed() { return storageFailed; }
