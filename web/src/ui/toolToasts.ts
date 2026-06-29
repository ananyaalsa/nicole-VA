// Maps Nicole's tool calls to the in-progress toast shown while they run.
// (The success/error toast text comes from the server's tool-result echo.)

export interface ToolToast {
  /** In-progress copy, e.g. "Checking your calendar…". */
  progress: string;
  /** A small glyph for the toast. */
  icon: string;
}

export const TOOL_TOASTS: Record<string, ToolToast> = {
  // Google
  list_calendar_events: { progress: 'Checking your calendar…', icon: '📅' },
  book_meeting:         { progress: 'Booking the meeting…',     icon: '📅' },
  list_emails:          { progress: 'Checking your inbox…',     icon: '✉️' },
  draft_email:          { progress: 'Drafting the email…',      icon: '✉️' },
  send_email:           { progress: 'Sending the email…',       icon: '✉️' },
  // Notion
  search_notion:        { progress: 'Searching Notion…',        icon: '📝' },
  create_notion_page:   { progress: 'Creating a Notion page…',  icon: '📝' },
  // Todoist
  create_task:          { progress: 'Adding the task…',         icon: '✅' },
  list_tasks:           { progress: 'Checking your tasks…',      icon: '✅' },
  complete_task:        { progress: 'Marking it done…',          icon: '✅' },
  // Slack
  post_slack:           { progress: 'Posting to Slack…',         icon: '💬' },
  list_slack_channels:  { progress: 'Loading Slack channels…',   icon: '💬' },
  read_slack_channel:   { progress: 'Reading Slack…',            icon: '💬' },
};

/** Web-search grounding (Gemini googleSearch) surfaces as this when detected. */
export const SEARCH_TOAST: ToolToast = { progress: 'Searching the web…', icon: '🔍' };
