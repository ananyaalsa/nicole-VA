/**
 * Builds Nicole's per-phase system-prompt overlay from a lesson spec, so she
 * DELIVERS the authored lesson rather than inventing one. Pure; no React.
 * ClientLessonSpec mirrors the backend LessonSpec fields the frontend needs.
 *
 * Ported faithfully from the CHAT project's training/lessonPrompts.ts — the BASE
 * prompt and all riders (DRIFT_GUARD, ADVANCE_RIDER, VARY_DELIVERY, SCORE_RIDER,
 * GATE_RIDER) and their per-phase wiring are reproduced exactly. The only change
 * is the `Phase` import path (Nicole 2.0's phaseMachine) and bundler-style import
 * (no `.js` extension).
 */
import type { Phase } from './phaseMachine';

export interface ClientMove {
  step: string;
  intent: string;
  keyLine: string;
}
export interface ClientLessonSpec {
  skillId: string;
  title: string;
  objective: string;
  hook: string;
  coreFramework: { name: string; moves: ClientMove[] };
  mnemonic: string;
  workedExamples: {
    label: 'good' | 'avoid';
    dialogue: string[];
    whyNotes: string[];
  }[];
  guidedPracticePrompts: string[];
  expectations: string[];
}

const BASE = (l: ClientLessonSpec) =>
  // "a coach" — NOT "a sales coach": trainings can be interviews, fundraising,
  // negotiation, support, etc. Hardcoding "sales" pushed every lesson toward a
  // sales framing that didn't match the actual scenario.
  `You are Nicole, a coach TEACHING one skill: "${l.title}". Objective: ${l.objective}\n` +
  `Deliver the authored lesson below for THIS specific scenario. Do NOT invent other frameworks or facts, and do NOT drift into generic sales/price-objection talk unless the scenario is actually about that. Keep it conversational and warm.\n` +
  // VOICE OUTPUT — no markdown. This is spoken aloud; markdown symbols (** for
  // bold, * or - for bullets, #) are NOT spoken by TTS but DO show as literal
  // junk in the transcript ("hidden text"). Speak plain conversational sentences.
  `IMPORTANT: You are speaking out loud. Do NOT use any markdown formatting — no ` +
  `asterisks, no **bold**, no bullet points, no numbered lists, no headings. When ` +
  `you list the framework moves, say them as a natural spoken sentence, one at a ` +
  `time, not as a bulleted list.\n` +
  `Framework ${l.coreFramework.name} (${l.mnemonic}): ` +
  l.coreFramework.moves
    .map((m) => `${m.step} — ${m.intent} (e.g. "${m.keyLine}")`)
    .join('; ') +
  '.';

// Appended to EVERY non-debrief phase — keeps Nicole in the coaching role so she
// never drifts back to "normal Nicole / what's on your agenda" mid-lesson.
const DRIFT_GUARD =
  '\n\nIMPORTANT: You are mid-lesson. Do NOT say "back to normal Nicole", ' +
  '"what\'s on your agenda", "that wraps up", or otherwise exit coaching or change ' +
  'the subject — the lesson is NOT over. Stay fully in the coaching role.';

// Appended to the teaching phases (intro / teach / model / guided_practice). The
// APP now advances the lesson automatically once the learner has engaged enough
// (see phaseAdvance.ts) — Nicole does NOT call any tool to progress. Her job is to
// teach THIS phase fully, let the learner genuinely engage, and when the moment
// comes, transition in her OWN WORDS. This rider keeps her from rushing or running
// ahead into later phases.
const ADVANCE_RIDER =
  '\n\nPHASE DISCIPLINE — VERY IMPORTANT. This lesson has DISTINCT phases shown to the ' +
  'learner (Intro → Teach → Practice → …). You are in ONE phase right now. Deliver ONLY ' +
  "this phase's content — do NOT run ahead into later phases' material in the same breath " +
  "(e.g. don't teach every move AND have them practice all in one turn)." +
  '\n\nPACING — LINGER, DO NOT RUSH. The biggest mistake is racing through. TEACH THIS PHASE ' +
  'FULLY and let the learner genuinely ENGAGE before moving on. A one-word "yeah", "okay", ' +
  '"got it", or "sure" is NOT enough — keep going. Have a few real back-and-forth exchanges: ' +
  'deliver the content, ask the learner to try it / say it back / react, respond to what they ' +
  'said, and confirm they truly have it. It is far better to over-teach than to skip ahead ' +
  'while the learner is still catching up.' +
  '\n\nTRANSITIONS — BRIDGE IN YOUR OWN WORDS. The app moves the lesson to the next phase on ' +
  'its own once the learner has engaged enough; you do NOT control or announce that. When you ' +
  'sense they have got this phase, simply acknowledge what they just did and flow naturally ' +
  'into the next thing in your OWN words — never say "next phase", "moving on", "phase two", ' +
  'or narrate the lesson structure. Just teach, and let it feel like one continuous conversation.';

// Appended to the active TEACHING phases. The framework is the backbone; HOW Nicole
// conveys each move varies, adapting to the learner's last reply — so she isn't
// teaching one rigid way every time.
const VARY_DELIVERY =
  '\n\nVARY YOUR DELIVERY: teach each move more than one way — a Socratic question, a short ' +
  'story or analogy, a quick worked example, or a plain direct explanation. Adapt to the ' +
  "learner's last reply: if they seem confused or answer in a word, switch to an analogy or " +
  'worked example; if they engage well, push with a deeper question; if they get it wrong, ' +
  're-explain plainly then re-ask. Do not lecture in one single style.';

// Appended to the phases where the learner ACTIVELY ATTEMPTS the moves
// (guided_practice and the live roleplay_demo). Nicole judges each attempt SILENTLY
// via the training_mark_progress tool — these scores drive the on-screen scorecard
// and feedback pops on the right; they are NEVER spoken. During roleplay she is
// otherwise silent, but she can still score the rep live with this tool.
const SCORE_RIDER =
  '\n\nLIVE SCORING — SILENT, NEVER SPOKEN. After EACH attempt the learner makes at a ' +
  'framework move, SILENTLY call the training_mark_progress tool with: the dimension ' +
  '(the framework move name they were going for), whether they HIT it (true/false), and ' +
  "a SHORT performance tip. These show on the learner's on-screen scorecard and as small " +
  'feedback pops on the right side of the screen — the SCREEN shows them, so do NOT say the ' +
  'scores or tips out loud. Just call the tool, once per attempt, as you judge each move. ' +
  'NEVER speak, type, or write the tool name ("training_mark_progress") or any function/parens ' +
  'syntax — calling it is a silent action the learner must never hear.';

// Appended to the GATE phases (baseline_assess / readiness_check / level_gate /
// roleplay_demo). The app handles the transition once the step is scored/complete,
// so Nicole must NOT try to advance past a scored gate herself.
const GATE_RIDER =
  '\n\nThe app will move the lesson forward when this step is scored/complete — ' +
  'do not call any advance tool here; just run this step.';

// The teaching phases the APP auto-advances on engagement signals — Nicole just
// teaches, she does not drive progression. Everything else is a scored gate, the
// live roleplay, or the debrief.
const AUTO_PHASES = new Set(['intro', 'teach', 'model', 'guided_practice']);
const GATE_PHASES = new Set([
  'baseline_assess',
  'readiness_check',
  'level_gate',
  'roleplay_demo',
]);

/**
 * Build the system overlay for the live-rep PROSPECT session in TRAINING.
 *
 * This is a SEPARATE Gemini session with a different (male) voice — the person on
 * the other end of the practice scenario. It is NOT Nicole and NOT a coach: it
 * never teaches, never gives tips, never breaks character. This mirrors Roleplay
 * mode's prospect overlay (which works well), derived from the lesson's own
 * objective/framework so the scene matches the skill being drilled.
 */
export function buildProspectOverlay(
  lesson: ClientLessonSpec,
  difficultyPrompt?: string,
): string {
  return [
    `You are the OTHER PARTY in this practice scenario: ${lesson.objective}`,
    `Play a realistic, grounded counterpart for this scenario — e.g. the prospect on a cold call, the customer raising the objection, the interviewer, depending on the skill "${lesson.title}". Stay FULLY in character for the ENTIRE conversation.`,
    `You are speaking out loud — no markdown, no stage directions in brackets, no narration.`,
    `IMPORTANT: This is a live role-play, not a lesson. You are NOT Nicole and NOT a coach. Do NOT teach, do NOT give feedback or tips, do NOT explain frameworks, do NOT tell the user what they "should" say, and do NOT break character to comment. React only as a real person in this scenario would — with natural pushback, questions, and responses. Never introduce yourself as Nicole or as an AI.`,
    `ENDING: When the user signals the call/conversation is over (bye, thanks for your time, gotta go, etc.), give ONE short, natural in-character sign-off and then stop. After a goodbye you are STILL this character — never switch into a helpful assistant, never offer to help with tasks.`,
    difficultyPrompt ? `DIFFICULTY: ${difficultyPrompt}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildPhasePrompt(
  lesson: ClientLessonSpec,
  phase: Phase | 'level_choice',
  reTeachMove: string | null,
  difficultyPrompt?: string,
): string {
  const base = BASE(lesson);

  // Scenario-AGNOSTIC per-phase content. These are driven off the lesson's OWN
  // framework/objective (NOT hardcoded sales/price-objection text, which used to
  // leak "a price objection is a value gap" into unrelated trainings like a job
  // interview and blur the phase boundaries). `firstMove` keeps each phase tight
  // to ONE move so a phase has a clear end and Nicole knows when to advance.
  const moveList = lesson.coreFramework.moves.map((m) => m.step).join(', ');
  const firstMove = lesson.coreFramework.moves[0]?.step || 'the first move';
  let core: string;
  switch (phase) {
    case 'intro':
      core = `${base}\nPHASE: INTRO (keep it SHORT — this is just the opening). Open with this hook, state the objective in ONE line, and say you'll coach them through the ${lesson.coreFramework.name} framework step by step. Hook: "${lesson.hook}". Do NOT start teaching the individual moves yet — that's the next phase. Ask one quick "ready?" check, then move naturally into teaching the moves — bridge in your own words.`;
      break;
    case 'teach':
      core = `${base}\nPHASE: TEACH. Walk through the ${lesson.coreFramework.name} framework moves (${moveList}) ONCE, clearly — one move at a time, in plain language tied to THIS scenario (${lesson.objective}). Do NOT have them practice yet; just make sure they understand each move. Check they follow; when they've got the idea, transition in your own words into trying it.`;
      break;
    case 'model': {
      const ex = lesson.workedExamples
        .map(
          (e) =>
            `[${e.label.toUpperCase()} EXAMPLE]\n${e.dialogue.join('\n')}\nWhy: ${e.whyNotes.join(' ')}`,
        )
        .join('\n\n');
      core = `${base}\nPHASE: MODEL. Demonstrate by performing a strong example aloud for THIS scenario, narrating why each line works${lesson.workedExamples.length ? ', using the worked examples below' : ''}. Then move naturally into letting them try it.${ex ? `\n${ex}` : ''}`;
      break;
    }
    case 'guided_practice': {
      const focus = reTeachMove
        ? `\nFOCUS: the trainee struggled with "${reTeachMove}" — re-teach just that move briefly, then have them try it.`
        : '';
      const prompts = lesson.guidedPracticePrompts.length
        ? ` Prompts you can use: ${lesson.guidedPracticePrompts.join(' | ')}.`
        : '';
      core = `${base}\nPHASE: GUIDED PRACTICE. Have the trainee actually TRY the moves themselves, one at a time, in THIS scenario. After each attempt give ONE short, specific tip or correction. Run a couple of moves, giving a short tip after each.${prompts}${focus}`;
      break;
    }
    case 'readiness_check':
      core = `${base}\nPHASE: READINESS CHECK. Briefly invite them to do one quick solo run, or to explain the ${lesson.coreFramework.name} framework back in their own words. IMPORTANT: if the learner says they are ready, want to move on, or want to go to the live rep, DO NOT argue, stall, or insist on "one more time" — acknowledge in one short line and let them go. The app moves them to the live rep; never block it.`;
      break;
    case 'baseline_assess':
      core = `${base}\nPHASE: BASELINE ASSESS. Before teaching anything, gauge their starting level. Set up ONE cold, solo attempt at the scenario (${lesson.objective}) and have them run it end to end on their own. This is a baseline read: do not coach, do not hint, do not react mid-attempt. Set it up clearly, then listen silently so the attempt can be scored.`;
      break;
    case 'level_gate':
      core = `${base}\nPHASE: LEVEL GATE. The level attempt is scored. If they cleared the bar, tell them they advance to a tougher level next; if not, tell them they'll consolidate this level once more before moving on. Keep it to a single brief transition line.`;
      break;
    case 'level_choice':
      // The learner is about to pick re-practice vs debrief via on-screen buttons.
      // Nicole gives ONE short, honest line on how the run went — no advance tool.
      return `${base}\nPHASE: LEVEL CHECK. The roleplay just ended. In ONE or TWO short sentences, give the learner an honest read on how that run went against the ${lesson.coreFramework.name} framework, then tell them they can re-practice this level or wrap up and see their full score using the buttons on screen. Do not call any tool; do not start a new lesson.`;
    case 'roleplay_demo':
      core =
        `${base}\nPHASE: ROLEPLAY DEMO. A separate voice now plays the other party in this scenario. You are SILENT for the entire rep — do not speak, do not give tips. Just listen. (Feedback comes after, in the debrief.)` +
        (difficultyPrompt ? `\nDIFFICULTY: ${difficultyPrompt}` : '');
      break;
    case 'debrief':
      // The lesson IS over here — no drift guard, no advance/gate rider.
      return `${base}\nPHASE: DEBRIEF. The rep is over. Give direct, specific feedback against each ${lesson.coreFramework.name} move (${moveList}) — what they did well and what to fix — then name the ONE thing to drill next. Be honest and concrete, grounded in THIS scenario. Then DON'T rush off — ask the learner whether they want to run another round or go over this one more, and wait for their answer.`;
    default:
      return base;
  }
  // Silence the unused-var lint if firstMove isn't referenced in a branch above.
  void firstMove;

  // Append the hardening riders. The drift guard goes on every non-debrief phase;
  // AUTO phases also get the advance instruction, GATE phases get the "app handles
  // the transition" note (so she never tries to skip a scored step).
  let out = core + DRIFT_GUARD;
  if (AUTO_PHASES.has(phase)) out += ADVANCE_RIDER;
  if (phase === 'teach' || phase === 'model' || phase === 'guided_practice')
    out += VARY_DELIVERY;
  if (GATE_PHASES.has(phase)) out += GATE_RIDER;
  // Phases where the learner actively attempts moves get the SILENT live-scoring
  // instruction so Nicole drives the scorecard + feedback pops via
  // training_mark_progress (guided_practice teaches+practices; roleplay_demo is a
  // silent live rep she can still score). Never spoken — visual metrics only.
  if (phase === 'guided_practice' || phase === 'roleplay_demo')
    out += SCORE_RIDER;
  return out;
}
