const hangul = /[\uac00-\ud7a3]/;
const fallback = /[\uac00-\ud7a3]+|[^\uac00-\ud7a3]+/g;

export function koreanWordParts(text) {
  if (typeof text !== 'string') return [];
  if (typeof Intl.Segmenter !== 'function') return [...text.matchAll(fallback)].map(([part]) => ({ text: part, word: hangul.test(part) }));
  const segmenter = new Intl.Segmenter('ko', { granularity: 'word' });
  return [...segmenter.segment(text)].map(({ segment, isWordLike }) => ({ text: segment, word: Boolean(isWordLike && hangul.test(segment)) }));
}
