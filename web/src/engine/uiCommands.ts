/**
 * The UI Command Bus — the single place Nicole's voice commands become UI
 * actions.
 *
 * Nicole calls a tool (set_camera, switch_mode, set_voice, mute_ai, mute_mic,
 * end_session, …); the session hook hands the call here; this bus dispatches it
 * to whichever screen registered a handler for that command. Adding a new
 * "Nicole can control X" is one `register('do_x', fn)` call from the owning
 * component — nothing else changes.
 *
 * Framework-free + synchronous so it's trivially unit-testable.
 */

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export type CommandHandler = (args: Record<string, unknown>) => void;

export class UiCommandBus {
  private handlers = new Map<string, CommandHandler>();
  private unknown: ((call: ToolCall) => void) | null = null;

  /** Register a handler for a command. Returns an unregister function. */
  register(name: string, handler: CommandHandler): () => void {
    this.handlers.set(name, handler);
    return () => {
      // Only remove if it's still the same handler (avoids races on re-register).
      if (this.handlers.get(name) === handler) this.handlers.delete(name);
    };
  }

  /** Optional catch-all for calls with no registered handler (for logging). */
  onUnknown(cb: (call: ToolCall) => void): void {
    this.unknown = cb;
  }

  /** Dispatch one tool call. Returns true if a handler ran. */
  dispatch(call: ToolCall): boolean {
    const handler = this.handlers.get(call.name);
    if (handler) {
      handler(call.args ?? {});
      return true;
    }
    this.unknown?.(call);
    return false;
  }

  /** Dispatch a batch of calls (Gemini can send several at once). */
  dispatchAll(calls: ToolCall[]): void {
    for (const call of calls) this.dispatch(call);
  }

  /** True if a command currently has a handler. */
  has(name: string): boolean {
    return this.handlers.has(name);
  }
}

/** Extract tool calls from a raw Gemini server message (or [] if none). */
export function extractToolCalls(payload: unknown): ToolCall[] {
  const calls = (payload as any)?.toolCall?.functionCalls;
  if (!Array.isArray(calls)) return [];
  return calls
    .filter((c) => c && typeof c.name === 'string')
    .map((c) => ({ name: c.name as string, args: (c.args ?? {}) as Record<string, unknown> }));
}
