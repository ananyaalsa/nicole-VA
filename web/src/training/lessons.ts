import type { ClientLessonSpec } from './lessonPrompts';

/**
 * The real teaching lessons Nicole coaches in TRAINING mode — ported faithfully
 * from the CHAT project's sales-training lesson specs (cold-call-open / discovery
 * -questions / price-objection) plus a STAR interview lesson. These are the skills
 * Nicole TEACHES step-by-step (intro → teach → model → practice → roleplay →
 * debrief), distinct from Roleplay mode (pure practice, no teaching).
 */

/** Opening a Cold Call — framework PIN. (CHAT: lessons/cold-call-open.ts) */
const COLD_CALL_OPEN: ClientLessonSpec = {
  skillId: 'cold_call_open',
  title: 'Opening a Cold Call',
  objective: 'Earn the first 30 seconds of a cold call without getting hung up on.',
  hook: "You've got 5 seconds before they say 'not interested.' What's your opener?",
  coreFramework: {
    name: 'PIN',
    moves: [
      { step: 'Pattern-interrupt', intent: 'break the sales-call script so they pause', keyLine: "Hi — I know this is a cold call, can I have 20 seconds and you decide if it's worth more?" },
      { step: 'Interest', intent: 'one sharp reason relevant to them', keyLine: 'We help teams like yours cut onboarding time in half.' },
      { step: 'Next-step', intent: 'ask for a small yes, not the meeting yet', keyLine: 'Worth two minutes now, or should I send something first?' },
    ],
  },
  mnemonic: 'PIN — Pattern-interrupt, Interest, Next-step',
  workedExamples: [
    {
      label: 'good',
      dialogue: [
        'You: Hi, I know this is a cold call — can I have 20 seconds and you decide if it is worth more?',
        'Prospect: ...fine, go.',
        'You: We help ops teams like yours cut onboarding time in half. Worth two minutes now, or should I send something first?',
      ],
      whyNotes: ['Pattern-interrupt earns the pause.', 'Interest is specific, not a feature dump.', 'Next-step asks for a small yes.'],
    },
    {
      label: 'avoid',
      dialogue: [
        'You: Hi, how are you today? I am calling from Acme, we are a leading provider of...',
        'Prospect: Not interested. *click*',
      ],
      whyNotes: ['"How are you today" + a pitch = instant hang-up. No pattern-interrupt, no relevance.'],
    },
  ],
  guidedPracticePrompts: [
    'They just picked up. Give me your pattern-interrupt line.',
    'Now your one-line interest hook.',
    'Now ask for the small next step.',
  ],
  expectations: ['interrupts the expected script', 'gives a relevant reason fast', 'asks for a small commitment, not the full meeting'],
};

/** Discovery: Ask Before You Pitch — framework ASK. (CHAT: lessons/discovery-questions.ts) */
const DISCOVERY_QUESTIONS: ClientLessonSpec = {
  skillId: 'discovery_questions',
  title: 'Discovery: Ask Before You Pitch',
  objective: 'Run a discovery that surfaces the real problem before pitching anything.',
  hook: 'A prospect is on the call. The fastest way to lose them is to pitch. So what do you do instead?',
  coreFramework: {
    name: 'ASK',
    moves: [
      { step: 'Ask open', intent: 'open-ended question that invites the story', keyLine: 'Walk me through how you handle this today.' },
      { step: 'Stay quiet', intent: 'let silence pull out the real answer', keyLine: '(let them finish — do not jump in)' },
      { step: 'Keep digging', intent: 'follow the thread to the cost/impact', keyLine: 'And when that breaks, what does it cost you?' },
    ],
  },
  mnemonic: 'ASK — Ask open, Stay quiet, Keep digging',
  workedExamples: [
    {
      label: 'good',
      dialogue: [
        'You: Walk me through how you handle onboarding today.',
        'Prospect: Honestly it is a mess, spreadsheets everywhere.',
        'You: (stays quiet)',
        'Prospect: ...and it takes us like three weeks per hire.',
        'You: And when it drags like that, what does it cost you?',
      ],
      whyNotes: ['Open question invites the story.', 'Silence pulls out the real pain.', 'Digging reaches the cost — now you can tie value.'],
    },
    {
      label: 'avoid',
      dialogue: [
        'You: Do you struggle with onboarding? Because our tool fixes that with automated workflows and...',
        'Prospect: We are fine, thanks.',
      ],
      whyNotes: ['Closed question + immediate pitch = no discovery, easy "no".'],
    },
  ],
  guidedPracticePrompts: [
    'Open the discovery with one open-ended question.',
    'They paused — what do you do?',
    'Dig one level deeper toward the cost.',
  ],
  expectations: ['asks open-ended, not yes/no', 'tolerates silence', 'digs to the cost/impact before pitching'],
};

/** Handling the Price Objection — framework AER. (CHAT: lessons/price-objection.ts) */
const PRICE_OBJECTION: ClientLessonSpec = {
  skillId: 'price_objection',
  title: 'Handling the Price Objection',
  objective: 'Handle a price objection without dropping the price or getting defensive.',
  hook: "A prospect just said 'that's too expensive.' Quick — what's the WORST thing you could say back?",
  coreFramework: {
    name: 'AER',
    moves: [
      { step: 'Acknowledge', intent: 'validate the concern without conceding', keyLine: 'Totally fair to ask about price.' },
      { step: 'Explore', intent: 'find the real concern — budget vs value', keyLine: 'When you say expensive, compared to what exactly?' },
      { step: 'Reframe', intent: 'shift from the number to value / cost of inaction', keyLine: "Let's look at what it costs to NOT fix this." },
    ],
  },
  mnemonic: 'AER — Acknowledge, Explore, Reframe',
  workedExamples: [
    {
      label: 'good',
      dialogue: [
        'Prospect: You are way more expensive than the other quote.',
        'You: Totally fair to bring up price.',
        'You: When you say expensive — compared to what exactly?',
        'Prospect: The vendor down the street is 30% less.',
        'You: Got it. If this saved your team 10 hours a week, what would that be worth?',
      ],
      whyNotes: [
        'Acknowledge: warm, no apology, no defensiveness.',
        'Explore: a real question that surfaces the true concern before responding.',
        'Reframe: moves the conversation from the number to value / ROI.',
      ],
    },
    {
      label: 'avoid',
      dialogue: ['Prospect: You are too expensive.', 'You: Okay, I can do 15% off.'],
      whyNotes: ['Dropped price instantly — taught the prospect to push on price every time. Never auto-discount.'],
    },
  ],
  guidedPracticePrompts: [
    "Prospect says 'too expensive.' Give me just your Acknowledge line.",
    'Now give me the Explore question.',
    'Now the Reframe — tie it to value.',
  ],
  expectations: [
    'Acknowledges before rebutting.',
    'Explores before reframing.',
    'Reframes to value / cost of inaction.',
    'Never auto-discounts.',
  ],
};

/** Interview: Answer behavioral questions with STAR. */
const INTERVIEW_STAR: ClientLessonSpec = {
  skillId: 'interview_star',
  title: 'Answering Behavioral Questions with STAR',
  objective: 'Answer "tell me about a time…" questions with a clear, complete STAR structure.',
  hook: "The interviewer asks 'tell me about a time you failed.' How do you keep it from rambling?",
  coreFramework: {
    name: 'STAR',
    moves: [
      { step: 'Situation', intent: 'set the scene in one or two sentences', keyLine: 'At my last role, our launch was two weeks from deadline and behind.' },
      { step: 'Task', intent: 'what you specifically were responsible for', keyLine: 'I owned getting the checkout flow shipped on time.' },
      { step: 'Action', intent: 'the concrete steps YOU took (not "we")', keyLine: 'I cut scope to the core path and paired with QA daily.' },
      { step: 'Result', intent: 'the outcome, with a number if you can', keyLine: 'We shipped on time and conversion went up 12%.' },
    ],
  },
  mnemonic: 'STAR — Situation, Task, Action, Result',
  workedExamples: [
    {
      label: 'good',
      dialogue: [
        'Interviewer: Tell me about a time you handled a tight deadline.',
        'You: At my last role, a launch was two weeks out and behind. (Situation)',
        'You: I owned shipping the checkout flow on time. (Task)',
        'You: I cut scope to the core path and paired with QA every day. (Action)',
        'You: We shipped on time and conversion rose 12%. (Result)',
      ],
      whyNotes: ['Each move is one or two crisp sentences.', 'Action is "I", not a vague "we".', 'Result has a real number.'],
    },
    {
      label: 'avoid',
      dialogue: [
        'Interviewer: Tell me about a time you handled a tight deadline.',
        'You: Um, we always have deadlines, and the team works hard, and it usually works out fine...',
      ],
      whyNotes: ['No situation, no specific action, no result. Vague "we" hides what YOU did.'],
    },
  ],
  guidedPracticePrompts: [
    'Set the Situation for a deadline story in one or two sentences.',
    'Now state your Task — what were YOU responsible for?',
    'Give the Action you personally took, then the Result with a number.',
  ],
  expectations: ['names all four STAR parts', 'uses "I" for the action, not "we"', 'ends on a concrete result'],
};

/** All teaching lessons shown in the Training picker. */
export const LESSONS: ClientLessonSpec[] = [
  COLD_CALL_OPEN,
  DISCOVERY_QUESTIONS,
  PRICE_OBJECTION,
  INTERVIEW_STAR,
];
