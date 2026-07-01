// web/src/canvas/panels/WeatherPanel.tsx
import type { JSX } from 'react';
import type { PanelComponentProps } from './registry';

export function WeatherPanel({ panel }: PanelComponentProps): JSX.Element {
  const a = panel.args ?? {};
  const forecast = Array.isArray(a.forecast) ? (a.forecast as Array<{ date: string; hiC: number; loC: number; icon: string }>) : [];
  return (
    <div className="canvas-weather" data-testid="weather-panel">
      <div className="canvas-weather__now">
        <span className="canvas-weather__ic" aria-hidden="true">{String(a.icon ?? '🌡️')}</span>
        <span className="canvas-weather__temp">{String(a.tempC ?? '--')}°</span>
        <span>{String(a.condition ?? '')}<br /><small>Feels {String(a.feelsC ?? a.tempC ?? '--')}°</small></span>
      </div>
      <div className="canvas-weather__place">{String(a.place ?? 'Your area')}</div>
      {forecast.length > 0 && (
        <div className="canvas-weather__days">
          {forecast.map((d) => (
            <div key={d.date} className="canvas-weather__day">
              <span className="canvas-weather__day-label">{new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' })}</span>
              <span aria-hidden="true">{d.icon}</span>
              <span>{d.hiC}°/{d.loC}°</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
