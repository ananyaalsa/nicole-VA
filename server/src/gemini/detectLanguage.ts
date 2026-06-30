// Lightweight conversation-language detection for the live relay.
//
// Purpose: when the user switches the conversation to another language, we
// re-anchor that language in the system prompt on every reconnect so Nicole
// doesn't snap back to English after a voice change / session refresh.
//
// This is deliberately simple and dependency-free. It detects by Unicode script
// for non-Latin languages (the strongest signal — Hindi speech usually comes
// through as Devanagari in the transcript), plus a small romanized-Hindi
// keyword heuristic for when the transcript comes back in Latin letters.

/** Map a detected language to the human label we put in the prompt. */
export type Language = string;

interface ScriptRule {
  label: Language;
  // Unicode range test.
  re: RegExp;
}

// Script ranges → language label. Ordered; first match wins.
const SCRIPT_RULES: ScriptRule[] = [
  { label: 'Hindi', re: /[ऀ-ॿ]/ }, // Devanagari
  { label: 'Bengali', re: /[ঀ-৿]/ },
  { label: 'Gujarati', re: /[઀-૿]/ },
  { label: 'Tamil', re: /[஀-௿]/ },
  { label: 'Telugu', re: /[ఀ-౿]/ },
  { label: 'Kannada', re: /[ಀ-೿]/ },
  { label: 'Malayalam', re: /[ഀ-ൿ]/ },
  { label: 'Arabic', re: /[؀-ۿ]/ },
  { label: 'Russian', re: /[Ѐ-ӿ]/ }, // Cyrillic
  { label: 'Japanese', re: /[぀-ヿ]/ }, // Hiragana/Katakana
  { label: 'Korean', re: /[가-힯]/ },
  { label: 'Chinese', re: /[一-鿿]/ },
];

// Common romanized-Hindi (Hinglish) function words. Two or more hits in a short
// utterance is a strong "this turn is Hindi" signal even in Latin script.
const ROMAN_HINDI = new Set([
  'hai', 'hain', 'haan', 'nahi', 'nahin', 'kya', 'kyun', 'kaise', 'kaise',
  'kar', 'karo', 'karna', 'karte', 'sakta', 'sakti', 'sakte', 'aap', 'aapko',
  'aapka', 'aapki', 'mujhe', 'mera', 'meri', 'mere', 'tum', 'hum', 'main',
  'madad', 'baat', 'chalo', 'theek', 'accha', 'achha', 'bilkul', 'dimaag',
  'wala', 'wali', 'kuch', 'koi', 'abhi', 'phir', 'lekin', 'aur', 'bhi',
]);

// A few romanized markers for Spanish/French, used only when there's no
// non-Latin script and no Hindi signal, to catch the common cases.
const ROMAN_SPANISH = new Set(['hola', 'gracias', 'por', 'favor', 'como', 'estas', 'que', 'hablar', 'español', 'espanol', 'tú', 'usted', 'bien']);
const ROMAN_FRENCH = new Set(['bonjour', 'merci', 'parler', 'français', 'francais', 'vous', 'comment', 'allez', 'oui', 'parlez']);

/** Tokenize to lowercase word list (Latin words only, for the heuristics). */
function words(text: string): string[] {
  return text.toLowerCase().match(/[a-zà-ÿ]+/gi) ?? [];
}

function countHits(ws: string[], set: Set<string>): number {
  let n = 0;
  for (const w of ws) if (set.has(w)) n += 1;
  return n;
}

/**
 * Detect the language of a single user utterance. Returns a language label
 * (e.g. "Hindi", "Spanish") or null if it looks like plain English / unknown.
 * Conservative: only returns a non-null, non-English language on a clear signal.
 */
export function detectLanguage(text: string): Language | null {
  const t = (text ?? '').trim();
  if (!t) return null;

  // 1) Non-Latin script is the strongest signal.
  for (const rule of SCRIPT_RULES) {
    if (rule.re.test(t)) return rule.label;
  }

  // 2) Romanized heuristics (Latin script). Need >=2 marker hits to fire, so a
  //    stray loanword in English ("the casa") doesn't flip the language.
  const ws = words(t);
  if (ws.length === 0) return null;
  const hindi = countHits(ws, ROMAN_HINDI);
  const spanish = countHits(ws, ROMAN_SPANISH);
  const french = countHits(ws, ROMAN_FRENCH);
  const max = Math.max(hindi, spanish, french);
  if (max >= 2) {
    if (hindi === max) return 'Hindi';
    if (spanish === max) return 'Spanish';
    return 'French';
  }

  // Otherwise assume English / no switch.
  return null;
}
