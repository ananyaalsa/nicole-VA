import { describe, it, expect } from 'vitest';
import { UI_CONTROL_TOOL_DECLS, UI_CONTROL_TOOL_NAMES, UI_VOICES } from './uiControlTools.js';

describe('UI_CONTROL_TOOL_DECLS', () => {
  it('declares all UI-control tools (incl. profile)', () => {
    const names = UI_CONTROL_TOOL_DECLS.map((d) => d.name).sort();
    expect(names).toEqual(
      [
        'end_session', 'mute_ai', 'mute_mic', 'set_camera', 'set_voice', 'switch_mode',
        'set_about', 'set_goal', 'set_display_name',
      ].sort(),
    );
  });

  it('set_goal takes an add/remove action + a goal', () => {
    const decl = UI_CONTROL_TOOL_DECLS.find((d) => d.name === 'set_goal')!;
    expect(decl.parameters.properties.action.enum).toEqual(['add', 'remove']);
    expect(decl.parameters.required).toEqual(['action', 'goal']);
  });

  it('every declared name is in the routing set', () => {
    for (const d of UI_CONTROL_TOOL_DECLS) {
      expect(UI_CONTROL_TOOL_NAMES.has(d.name)).toBe(true);
    }
  });

  it('set_voice enumerates exactly the 8 voices', () => {
    const decl = UI_CONTROL_TOOL_DECLS.find((d) => d.name === 'set_voice')!;
    expect(decl.parameters.properties.voiceName.enum).toEqual([...UI_VOICES]);
    expect(UI_VOICES).toHaveLength(8);
  });

  it('switch_mode enumerates talk/training/roleplay', () => {
    const decl = UI_CONTROL_TOOL_DECLS.find((d) => d.name === 'switch_mode')!;
    expect(decl.parameters.properties.mode.enum).toEqual(['talk', 'training', 'roleplay']);
  });

  it('mute tools require a boolean flag', () => {
    for (const name of ['mute_ai', 'mute_mic'] as const) {
      const decl = UI_CONTROL_TOOL_DECLS.find((d) => d.name === name)!;
      const flag = name === 'mute_ai' ? 'muted' : 'muted';
      expect(decl.parameters.required).toContain(flag);
    }
  });
});
