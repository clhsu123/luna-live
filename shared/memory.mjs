// Shared across appearances and both interfaces; never keyed by character.
export const MEMORY_KEY = 'luna.shared-memory.v1';
export function normalizeHistory(value, limit = 100, budget = 60000) {
  if (!Array.isArray(value)) return [];
  const result = []; const seen = new Set();
  for (const entry of value.slice(-200).reverse()) {
    if (!entry || !['user', 'assistant'].includes(entry.role) || typeof entry.text !== 'string' || !entry.text.trim()) continue;
    const id = typeof entry.id === 'string' ? entry.id.slice(0, 160) : `history-${result.length}`;
    if (seen.has(id)) continue;
    const text = entry.text.slice(0, Math.min(4000, budget));
    if (!text || result.length >= limit) break;
    result.push({ id, role: entry.role, text, time: typeof entry.time === 'string' ? entry.time.slice(0, 40) : '' });
    seen.add(id); budget -= text.length;
    if (budget <= 0) break;
  }
  return result.reverse();
}
export function replayEvents(history) {
  return normalizeHistory(history, 40, 16000).map(({ role, text }) => ({
    type: 'conversation.item.create',
    item: { type: 'message', role, content: [{ type: role === 'user' ? 'input_text' : 'output_text', text }] }
  }));
}
