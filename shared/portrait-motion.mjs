// Sprite frame order: neutral, blink, neutral, left, nod, right/smile, wave, neutral.
// Timings deliberately hold poses; these are frame animations, not video or visemes.
const idle = [[0,3000],[1,140],[2,2300],[3,650],[2,1800],[4,450],[2,1700],[5,700],[2,2000],[6,650],[7,2000]];
const speaking = [[0,1100],[4,450],[2,1300],[5,650],[2,1200],[1,140],[2,1300],[3,650],[7,1200]];
export function portraitFrame(elapsed, isSpeaking = false) {
 const sequence = isSpeaking ? speaking : idle;
 let time = Math.max(0, elapsed) % sequence.reduce((sum, [,duration]) => sum + duration, 0);
 for (const [frame,duration] of sequence) { if (time < duration) return frame; time -= duration; }
 return 0;
}
export function motionSource(id) {
 if (!Number.isInteger(id) || id < 1 || id > 20) throw Error('invalid_portrait');
 return `/wardrobe/motion/${String(id).padStart(2,'0')}.png`;
}
