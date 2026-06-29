import type { JSX } from 'react';

/* Shared provider/source brand glyphs, used by the Integrations panel AND the
   home brief cards so the iconography is consistent across the app. */

export const BRAND_ICONS: Record<string, JSX.Element> = {
  google: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" fill="#4285F4" />
      <path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.7-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" fill="#34A853" />
      <path d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9l3.3-2.6z" fill="#FBBC05" />
      <path d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6.1 12 6.1z" fill="#EA4335" />
    </svg>
  ),
  // Gmail envelope (Google red/blue) — for the email brief card.
  gmail: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.5" y="5" width="19" height="14" rx="2.2" fill="#fff" stroke="#EA4335" strokeWidth="1.4" />
      <path d="M3 6.5l9 6 9-6" stroke="#EA4335" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  // Google Calendar tile.
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="16" rx="2.4" fill="#fff" stroke="#4285F4" strokeWidth="1.4" />
      <path d="M3.5 8.5h17" stroke="#4285F4" strokeWidth="1.4" />
      <path d="M8 3.5v3M16 3.5v3" stroke="#4285F4" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="7" y="11" width="4" height="4" rx="0.6" fill="#34A853" />
    </svg>
  ),
  notion: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="2" width="16" height="20" rx="2" stroke="#1C1917" strokeWidth="1.8" />
      <path d="M8 7h8M8 11h5M8 15h6" stroke="#1C1917" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  todoist: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="#DB4035" strokeWidth="1.8" />
      <path d="M8 12l3 3 5-5" stroke="#DB4035" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  slack: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 3a2 2 0 1 0 0 4h2V3a2 2 0 0 0-2 0z" fill="#E01E5A" />
      <path d="M3 9a2 2 0 0 0 4 0V7H5a2 2 0 0 0-2 2z" fill="#36C5F0" />
      <path d="M15 21a2 2 0 1 0 0-4h-2v2a2 2 0 0 0 2 2z" fill="#2EB67D" />
      <path d="M21 15a2 2 0 0 0-4 0v2h2a2 2 0 0 0 2-2z" fill="#ECB22E" />
      <path d="M3 15a2 2 0 0 0 4 0v-2H5a2 2 0 0 0-2 2z" fill="#E01E5A" />
      <path d="M9 21a2 2 0 0 0 0-4H7v2a2 2 0 0 0 2 2z" fill="#36C5F0" />
      <path d="M21 9a2 2 0 0 0-4 0v2h2a2 2 0 0 0 2-2z" fill="#2EB67D" />
      <path d="M15 3a2 2 0 1 0 0 4h2V5a2 2 0 0 0-2-2z" fill="#ECB22E" />
    </svg>
  ),
};
