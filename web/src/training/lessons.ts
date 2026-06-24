/**
 * Authored training lessons Nicole delivers in coaching mode. Each lesson is a
 * complete {@link ClientLessonSpec} — real, usable teaching content — so the
 * per-phase prompt builder ({@link buildPhasePrompt}) has a concrete framework,
 * worked examples and practice prompts to drive a full session.
 */
import type { ClientLessonSpec } from './lessonPrompts';

/** SALES — handling the classic "it's too expensive" price objection. */
const PRICE_OBJECTION: ClientLessonSpec = {
  skillId: 'price_objection',
  title: 'Handling the Price Objection',
  objective:
    'Respond to "it\'s too expensive" without panicking or discounting — keep the conversation on value, not price.',
  hook: 'A buyer says "honestly, it\'s just too expensive." What\'s the worst thing you could say back?',
  coreFramework: {
    name: 'ACE',
    moves: [
      {
        step: 'Acknowledge',
        intent:
          'Validate the concern so the buyer feels heard instead of pushed back on — never argue or get defensive.',
        keyLine: "That's totally fair to raise — price matters, and I'd ask the same.",
      },
      {
        step: 'Clarify',
        intent:
          'Ask one calm question to find what "expensive" actually means: too expensive vs. what, on what budget, against which outcome.',
        keyLine: "When you say expensive, is it more than you expected, or more than the result is worth to you right now?",
      },
      {
        step: 'Elevate',
        intent:
          'Reframe from sticker price to the cost of the problem and the value of solving it — anchor on outcomes, not the number.',
        keyLine: "What's it costing you every month this stays unsolved? That's the number worth comparing against.",
      },
    ],
  },
  mnemonic: 'ACE — Acknowledge, Clarify, Elevate.',
  workedExamples: [
    {
      label: 'good',
      dialogue: [
        'Buyer: This is way more than I wanted to spend.',
        'You: That\'s completely fair to bring up — budget matters. Can I ask, is it more than you budgeted, or more than the outcome feels worth right now?',
        'Buyer: More than I budgeted, I guess.',
        'You: Got it. So if we look at what the slow process is costing you each month, the question becomes which number is actually bigger — the price, or the problem.',
      ],
      whyNotes: [
        'Acknowledges first so the buyer relaxes instead of digging in.',
        'Clarifies the real objection before answering it.',
        'Elevates to cost-of-inaction so value, not price, becomes the comparison.',
      ],
    },
    {
      label: 'avoid',
      dialogue: [
        'Buyer: This is way more than I wanted to spend.',
        'You: Okay, okay — I can probably do fifteen percent off if that helps?',
      ],
      whyNotes: [
        'Discounts instantly, training the buyer that the price was never real.',
        'Skips Acknowledge and Clarify, so you never learn what "expensive" meant.',
        'Competes on price — a race you lose — instead of on value.',
      ],
    },
  ],
  guidedPracticePrompts: [
    'I\'ll be the buyer: "That\'s a lot more than your competitor." Give me your Acknowledge line first.',
    'Now Clarify — ask me one question to find out what I really mean by expensive.',
    'Finish with Elevate — reframe me onto the cost of not solving this.',
  ],
  expectations: [
    'Acknowledges the concern before responding to it.',
    'Asks at least one clarifying question instead of assuming.',
    'Reframes to value / cost-of-inaction rather than dropping the price.',
    'Stays calm and curious — no defensiveness, no instant discount.',
  ],
};

/** INTERVIEW — answering the open-ended "tell me about yourself". */
const TELL_ME_ABOUT_YOURSELF: ClientLessonSpec = {
  skillId: 'tell_me_about_yourself',
  title: "Answering 'Tell Me About Yourself'",
  objective:
    'Give a crisp, confident 60–90 second answer to "tell me about yourself" that lands you as a strong fit — not a rambling life story.',
  hook: 'An interviewer opens with "so, tell me about yourself." Where do most people go wrong in the first ten seconds?',
  coreFramework: {
    name: 'PPF',
    moves: [
      {
        step: 'Present',
        intent:
          'Open with who you are professionally right now in one sharp line — your current role and a relevant strength.',
        keyLine: "I'm a product designer focused on turning messy workflows into interfaces people actually enjoy using.",
      },
      {
        step: 'Past',
        intent:
          'Give one or two relevant proof points from your background that built you toward this role — pick relevance over completeness.',
        keyLine: "Before this I spent three years at a fintech startup where I redesigned the onboarding flow and cut drop-off by 40%.",
      },
      {
        step: 'Future',
        intent:
          'Connect to why you want THIS role and company, so the answer points forward at them, not just backward at you.',
        keyLine: "What pulls me to this role is the chance to do that same outcome-driven design work at the scale your team operates at.",
      },
    ],
  },
  mnemonic: 'PPF — Present, Past, Future.',
  workedExamples: [
    {
      label: 'good',
      dialogue: [
        'Interviewer: Tell me about yourself.',
        'You: Sure — I\'m a product designer who specializes in making complex workflows feel simple.',
        'You: Over the last three years at a fintech startup I led the onboarding redesign and brought drop-off down by about forty percent.',
        'You: What excites me about this role is doing that same kind of outcome-focused design, but at your scale and on a product I actually use.',
      ],
      whyNotes: [
        'Present opens with a sharp professional identity, not "well, I was born in...".',
        'Past offers ONE relevant, quantified proof point instead of a full résumé.',
        'Future ties it to this specific role, signalling genuine interest and fit.',
      ],
    },
    {
      label: 'avoid',
      dialogue: [
        'Interviewer: Tell me about yourself.',
        'You: Well, I grew up in Ohio, I have two dogs, I studied biology even though I never really used it, then I kind of fell into design, and honestly I\'m not totally sure what I want next but I\'m open to anything...',
      ],
      whyNotes: [
        'Starts with personal trivia the interviewer did not ask for.',
        'No relevant proof points — nothing that signals fit for the role.',
        '"Open to anything" reads as unfocused; Future should point at THIS job.',
      ],
    },
  ],
  guidedPracticePrompts: [
    'Give me just your Present line — one sentence on who you are professionally, no backstory.',
    'Now your Past — pick ONE relevant accomplishment, ideally with a number, and say it in two sentences.',
    'Close with Future — tie it to why you want this specific role. Keep the whole thing under 90 seconds.',
  ],
  expectations: [
    'Opens with a clear present-tense professional identity.',
    'Chooses relevant proof points over a full chronological history.',
    'Ends pointing forward at this role and company, not trailing off.',
    'Stays concise — roughly 60 to 90 seconds, no rambling.',
  ],
};

/** All authored lessons, in the order they appear in the lesson picker. */
export const LESSONS: ClientLessonSpec[] = [
  PRICE_OBJECTION,
  TELL_ME_ABOUT_YOURSELF,
];
