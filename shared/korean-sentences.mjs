/** Keep Korean sentence boundaries so each line can receive its own translation. */
export function koreanSentences(text) {
  return String(text).match(/[^.!?。！？\n]+(?:[.!?。！？]+|$)/gu)?.map(x=>x.trim()).filter(Boolean) || [];
}
export function isKoreanSentence(text) { return /[가-힣]/u.test(text); }
