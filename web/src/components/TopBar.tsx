import type { JSX, ReactNode } from 'react';
import './TopBar.css';

export type Mode = 'talk' | 'training' | 'roleplay';

const NAV: Array<{ id: Mode; label: string; tooltip: string }> = [
  { id: 'talk', label: 'Talk', tooltip: 'Free-form voice conversation with Nicole' },
  { id: 'training', label: 'Training', tooltip: 'Structured sales training drills & lessons' },
  { id: 'roleplay', label: 'Roleplay', tooltip: 'Practice with AI roleplay scenarios' },
];

export interface TopBarProps {
  /** Which mode the current screen represents — its tab is marked active. */
  current: Mode;
  /**
   * Navigate to another mode. A tab is shown only if it's the current mode or
   * appears in `available`; the active tab is never clickable.
   */
  onNavigate?: (mode: Mode) => void;
  /** Inactive modes reachable from here. Defaults to the other two. */
  available?: Mode[];
  /**
   * Replaces the brand block on the left. Used by live rooms to show a small
   * coach/character avatar instead of the Nicole wordmark + nav tabs.
   */
  brand?: ReactNode;
  /** Hide the Talk/Training/Roleplay nav (live rooms don't show it). */
  hideNav?: boolean;
  /** Center slot — e.g. a session title in a live room. */
  center?: ReactNode;
  /** Right-hand controls — status chip, history button, avatar, mic/end, etc. */
  right?: ReactNode;
}

/**
 * The ONE topbar used across Talk, Training and Roleplay so the chrome is
 * identical everywhere. Pickers pass `current` + `onNavigate` to get the tab
 * row; live rooms pass a custom `brand` (small avatar) with `hideNav` and put
 * their session title in `center` and controls in `right`.
 */
export function TopBar({
  current,
  onNavigate,
  available,
  brand,
  hideNav,
  center,
  right,
}: TopBarProps): JSX.Element {
  const reachable = available ?? NAV.map((n) => n.id).filter((id) => id !== current);
  return (
    <header className="talk-topbar">
      {brand ?? (
        <div className="topbar-brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="topbar-brand-name">Nicole</span>
        </div>
      )}

      {!hideNav && (
        <nav className="topbar-nav" aria-label="Mode navigation">
          {NAV.map((item) => {
            const isActive = item.id === current;
            // Show the active tab always; others only if reachable.
            if (!isActive && (!onNavigate || !reachable.includes(item.id))) return null;
            return (
              <button
                key={item.id}
                type="button"
                className={`topbar-nav-item${isActive ? ' is-active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={isActive ? undefined : () => onNavigate?.(item.id)}
                data-tooltip={item.tooltip}
                data-tooltip-pos="bottom"
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      )}

      {center}

      <div className="topbar-right">{right}</div>
    </header>
  );
}

export default TopBar;
