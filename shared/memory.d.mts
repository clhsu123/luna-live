export type MemoryEntry = { id: string; role: 'user' | 'assistant'; text: string; time: string };
export const MEMORY_KEY: string;
export function normalizeHistory(value: unknown, limit?: number, budget?: number): MemoryEntry[];
export function replayEvents(history: unknown): { type: string; item: { type: string; role: string; content: {type: string; text: string}[] } }[];
