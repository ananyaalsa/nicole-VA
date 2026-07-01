// web/src/ui/friendlyError.ts
export type FriendlyErrorKind =
  | 'connect' | 'integrations_load' | 'action' | 'weather' | 'search' | 'generic';

/** Short, human-friendly, jargon-free error lines. No codes, no internals. */
export function friendlyError(kind: FriendlyErrorKind, provider?: string): string {
  const name = provider ?? 'that';
  switch (kind) {
    case 'connect':           return `Couldn't connect ${name} — want to try again?`;
    case 'integrations_load': return "Couldn't load your integrations. Retry?";
    case 'action':            return "That didn't go through. Try once more?";
    case 'weather':           return "Couldn't reach the weather right now.";
    case 'search':            return "Couldn't fetch results right now.";
    default:                  return 'Something went wrong. Try again?';
  }
}
