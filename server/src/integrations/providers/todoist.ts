// Todoist adapter — create a task, list today's tasks, complete a task.
//
// Todoist OAuth: authorize at todoist.com/oauth/authorize, exchange at
// todoist.com/oauth/access_token. Tokens do NOT expire (no refresh). REST v2
// under api.todoist.com/rest/v2. Scope data:read_write covers all of this.

import { integrationsConfig } from '../../config.js';
import { postForm, apiFetch } from '../http.js';
import type { ProviderAdapter, ToolDecl, ToolAction, ToolResult, ActionContext } from '../types.js';

const AUTH_URL = 'https://todoist.com/oauth/authorize';
const TOKEN_URL = 'https://todoist.com/oauth/access_token';
const API = 'https://api.todoist.com/rest/v2';
const SCOPES = ['data:read_write'];

function creds() {
  return integrationsConfig.todoist;
}

export const todoistAdapter: ProviderAdapter = {
  id: 'todoist',
  name: 'Todoist',
  description: 'Capture tasks by voice & check what’s due',
  scopes: SCOPES,

  isConfigured() {
    const c = creds();
    return Boolean(c.clientId && c.clientSecret);
  },

  getAuthUrl(state, _redirectUri) {
    // Todoist ignores redirect_uri in the authorize URL (set in the app config);
    // it's still validated on exchange.
    const params = new URLSearchParams({
      client_id: creds().clientId,
      scope: SCOPES.join(','),
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  async exchangeCode(code, redirectUri) {
    const body = await postForm(TOKEN_URL, {
      client_id: creds().clientId,
      client_secret: creds().clientSecret,
      code,
      redirect_uri: redirectUri,
    });
    return {
      accessToken: body.access_token,
      refreshToken: null,
      expiresAt: null, // Todoist tokens don't expire.
      scopes: SCOPES,
    };
  },

  toolDecls(): ToolDecl[] {
    return [
      {
        name: 'create_task',
        description:
          'Add a task to the user’s Todoist. Use when they want to remember a ' +
          'to-do, capture an action item, or set a reminder.',
        parameters: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'The task text.' },
            dueString: {
              type: 'string',
              description: 'Optional natural-language due date, e.g. "tomorrow 9am", "today".',
            },
            priority: { type: 'number', description: 'Optional 1 (normal) to 4 (urgent).' },
          },
          required: ['content'],
        },
      },
      {
        name: 'list_tasks',
        description:
          "List the user's open Todoist tasks, optionally filtered (e.g. due " +
          'today). Use when they ask what’s on their to-do list.',
        parameters: {
          type: 'object',
          properties: {
            filter: { type: 'string', description: 'Optional Todoist filter, e.g. "today", "overdue".' },
          },
          required: [],
        },
      },
      {
        name: 'complete_task',
        description: 'Mark a Todoist task done by its id (from list_tasks).',
        parameters: {
          type: 'object',
          properties: { taskId: { type: 'string', description: 'The task id to complete.' } },
          required: ['taskId'],
        },
      },
    ];
  },

  toolActions(): ToolAction[] {
    return [
      { name: 'create_task', mutating: true, describe: (a) => `add the task "${a.content}"` },
      { name: 'list_tasks', mutating: false, describe: () => 'check your tasks' },
      { name: 'complete_task', mutating: true, describe: () => 'mark a task done' },
    ];
  },

  async runTool(name, args, ctx: ActionContext): Promise<ToolResult> {
    const token = ctx.connection.accessToken;
    if (name === 'create_task') {
      const data = await apiFetch(`${API}/tasks`, {
        method: 'POST',
        token,
        body: {
          content: args.content,
          due_string: args.dueString || undefined,
          priority: args.priority ? Math.min(4, Math.max(1, Number(args.priority))) : undefined,
        },
      });
      const due = data.due?.string ? ` (due ${data.due.string})` : '';
      return { ok: true, summary: `Added "${args.content}" to your Todoist${due}.`, data: { id: data.id } };
    }
    if (name === 'list_tasks') {
      const params = new URLSearchParams();
      if (args.filter) params.set('filter', String(args.filter));
      const tasks: any[] = await apiFetch(`${API}/tasks?${params}`, { token });
      if (!Array.isArray(tasks) || tasks.length === 0) {
        return { ok: true, summary: 'You have no open tasks matching that.' };
      }
      const lines = tasks.slice(0, 8).map((t) => t.content);
      return {
        ok: true,
        summary: `You have ${tasks.length} task${tasks.length === 1 ? '' : 's'}: ${lines.join('; ')}.`,
        data: tasks,
      };
    }
    if (name === 'complete_task') {
      await apiFetch(`${API}/tasks/${args.taskId}/close`, { method: 'POST', token });
      return { ok: true, summary: 'Marked that task done.' };
    }
    return { ok: false, summary: `Todoist can't do "${name}".` };
  },
};
