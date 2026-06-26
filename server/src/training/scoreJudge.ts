export type ResultSpeaker = 'you' | 'rep' | 'nicole';
export interface ResultLine { speaker: ResultSpeaker; text: string }

export interface Signals {
  talkRatioPct: number;          // user words / (user + rep words), 0-100
  questionCount: number;          // user turns ending in '?'
  longestMonologueWords: number;  // longest single user turn, in words
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Deterministic conversation signals over a scored transcript. Coach ('nicole')
 *  lines are ignored — signals describe the user-vs-rep exchange only. */
export function computeSignals(lines: ResultLine[]): Signals {
  let userWords = 0;
  let repWords = 0;
  let questionCount = 0;
  let longestMonologueWords = 0;
  for (const l of lines) {
    if (l.speaker === 'you') {
      const w = wordCount(l.text);
      userWords += w;
      if (w > longestMonologueWords) longestMonologueWords = w;
      if (l.text.trim().endsWith('?')) questionCount += 1;
    } else if (l.speaker === 'rep') {
      repWords += wordCount(l.text);
    }
  }
  const total = userWords + repWords;
  const talkRatioPct = total === 0 ? 0 : Math.round((userWords / total) * 100);
  return { talkRatioPct, questionCount, longestMonologueWords };
}
