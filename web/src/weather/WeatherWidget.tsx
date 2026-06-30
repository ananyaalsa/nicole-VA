import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { createPortal } from 'react-dom';
import { getCoords, fetchWeatherAt, fetchWeatherFor, type Weather } from './weatherApi';
import './WeatherWidget.css';

/** Day-of-week label for a forecast date (Mon, Tue…). Today → "Today". */
function dayLabel(iso: string, i: number): string {
  if (i === 0) return 'Today';
  const d = new Date(iso + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { weekday: 'short' });
}

/** The expanded weather card (used both as the ambient-popover and the voice dialog). */
function WeatherCard({ w, onClose }: { w: Weather; onClose?: () => void }): JSX.Element {
  return (
    <div className="weather-card" role="dialog" aria-label={`Weather in ${w.place}`}>
      {onClose && (
        <button
          type="button"
          className="weather-card__close"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClose(); }}
          aria-label="Close"
        >×</button>
      )}
      <div className="weather-card__place">{w.place}</div>
      <div className="weather-card__now">
        <span className="weather-card__icon" aria-hidden="true">{w.icon}</span>
        <span className="weather-card__temp">{w.tempC}°</span>
        <span className="weather-card__cond">{w.condition}<br /><small>Feels {w.feelsC}°</small></span>
      </div>
      <div className="weather-card__meta">
        <span>💧 {w.humidity}%</span>
        <span>💨 {w.windKph} km/h</span>
      </div>
      <div className="weather-card__forecast">
        {w.forecast.map((d, i) => (
          <div key={d.date} className="weather-card__day">
            <span className="weather-card__day-name">{dayLabel(d.date, i)}</span>
            <span className="weather-card__day-icon" aria-hidden="true">{d.icon}</span>
            <span className="weather-card__day-temp">{d.hiC}°<small>{d.loC}°</small></span>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface WeatherWidgetHandle {
  /** Open the dialog for a named place (or current location when omitted).
   *  Resolves with a spoken-style line, or null on failure. */
  open: (location?: string) => Promise<Weather | null>;
}

/**
 * Ambient weather: a small always-on chip (current temp + icon) anchored bottom-
 * left of the Talk home. Clicking it expands the full card. Nicole can also open
 * the card by voice via the imperative handle (auto-dismisses after ~6s).
 */
export function WeatherWidget({
  handleRef,
  inline = false,
}: {
  handleRef?: (h: WeatherWidgetHandle) => void;
  /** Render the chip in-flow (inside the left panel) instead of floating bottom-left. */
  inline?: boolean;
}): JSX.Element | null {
  const [ambient, setAmbient] = useState<Weather | null>(null);
  const [dialog, setDialog] = useState<Weather | null>(null);
  const [expanded, setExpanded] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the ambient (current-location) weather once on mount.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const c = await getCoords();
      if (!c || !alive) return;
      try {
        const w = await fetchWeatherAt(c.lat, c.lon);
        if (alive) setAmbient(w);
      } catch { /* keep widget hidden on failure */ }
    })();
    return () => { alive = false; };
  }, []);

  const openDialog = useCallback(async (location?: string): Promise<Weather | null> => {
    try {
      let w: Weather;
      if (location && location.trim()) {
        w = await fetchWeatherFor(location.trim());
      } else if (ambient) {
        w = ambient;
      } else {
        const c = await getCoords();
        if (!c) return null;
        w = await fetchWeatherAt(c.lat, c.lon);
        setAmbient(w);
      }
      setDialog(w);
      // Auto-dismiss after ~6s (she's done speaking by then).
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      dismissTimer.current = setTimeout(() => setDialog(null), 6000);
      return w;
    } catch {
      return null;
    }
  }, [ambient]);

  // Expose the imperative open() to the parent (so a voice tool can call it).
  useEffect(() => {
    handleRef?.({ open: openDialog });
  }, [handleRef, openDialog]);

  useEffect(() => () => { if (dismissTimer.current) clearTimeout(dismissTimer.current); }, []);

  if (!ambient && !dialog) return null;

  return (
    <>
      {/* Ambient chip — inline (in the left panel) or floating bottom-left. */}
      {ambient && (
        <div className={`weather-widget${inline ? ' weather-widget--inline' : ''}`}>
          <button
            type="button"
            className={`weather-chip${inline ? ' weather-chip--inline' : ''}`}
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded ? 'true' : 'false'}
            aria-label={`Weather: ${ambient.tempC} degrees, ${ambient.condition} in ${ambient.place}`}
          >
            <span className="weather-chip__icon" aria-hidden="true">{ambient.icon}</span>
            <span className="weather-chip__temp">{ambient.tempC}°</span>
            <span className="weather-chip__place">{ambient.place.split(',')[0]}</span>
            {inline && <span className="weather-chip__cond">{ambient.condition}</span>}
          </button>
          {expanded && (
            <div
              className={`weather-widget__pop${inline ? ' weather-widget__pop--inline' : ''}`}
              onClick={(e) => e.stopPropagation()}
            >
              <WeatherCard w={ambient} onClose={() => setExpanded(false)} />
            </div>
          )}
        </div>
      )}

      {/* Voice-opened dialog (centered, auto-dismiss). Portaled to <body> so it
          shows on EVERY layout — including mobile, where the widget's host panel
          is hidden. Otherwise the weather card would be trapped in a display:none
          container and never appear when Nicole checks the weather by voice. */}
      {dialog && createPortal(
        <div className="weather-overlay" onClick={() => setDialog(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <WeatherCard w={dialog} onClose={() => setDialog(null)} />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export default WeatherWidget;
