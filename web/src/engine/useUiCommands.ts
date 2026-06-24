import { useEffect, useRef } from 'react';
import { UiCommandBus, type ToolCall } from './uiCommands';

/**
 * Wires Nicole's voice commands to UI actions in ONE place.
 *
 * The caller passes the handlers for each command it owns; this hook builds a
 * UiCommandBus, registers them, and returns `onToolCall` to feed into
 * useNicoleSession. Adding a new "Nicole can control X" is one more entry in the
 * `actions` object — nothing else changes.
 *
 * Handlers are read through a ref so the registration effect runs ONCE (stable),
 * yet every dispatch calls the latest closures — no stale state, no churn.
 */
export interface UiCommandActions {
  /** Open/close the camera. args: { on: boolean } */
  set_camera?: (args: Record<string, unknown>) => void;
  /** Switch screen. args: { mode: 'talk'|'training'|'roleplay' } */
  switch_mode?: (args: Record<string, unknown>) => void;
  /** Change voice. args: { voiceName: string } */
  set_voice?: (args: Record<string, unknown>) => void;
  /** Mute/unmute Nicole's own voice. args: { muted: boolean } */
  mute_ai?: (args: Record<string, unknown>) => void;
  /** Mute/unmute the user's mic. args: { muted: boolean } */
  mute_mic?: (args: Record<string, unknown>) => void;
  /** End the session. */
  end_session?: (args: Record<string, unknown>) => void;
  /** Any future command — keyed by tool name. */
  [command: string]: ((args: Record<string, unknown>) => void) | undefined;
}

export interface UseUiCommandsResult {
  /** Feed this into useNicoleSession({ onToolCall }). */
  onToolCall: (calls: ToolCall[]) => void;
}

export function useUiCommands(actions: UiCommandActions): UseUiCommandsResult {
  const busRef = useRef(new UiCommandBus());
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  // Register one stable handler per command name; it forwards to the latest
  // closure in actionsRef. Runs once.
  useEffect(() => {
    const bus = busRef.current;
    const names = Object.keys(actionsRef.current);
    const offs = names.map((name) =>
      bus.register(name, (args) => actionsRef.current[name]?.(args)),
    );
    return () => offs.forEach((off) => off());
  }, []);

  const onToolCall = (calls: ToolCall[]) => busRef.current.dispatchAll(calls);

  return { onToolCall };
}
