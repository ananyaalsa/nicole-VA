import type { JSX } from 'react';
import type { WeatherPayload } from '../resultTypes';
import './presenters.css';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function weekday(iso: string): string { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : WD[d.getDay()]; }

export function WeatherCard({ payload }: { payload: WeatherPayload }): JSX.Element {
  const p = payload;
  return (
    <div className="wx-card" data-testid="wx-card">
      <div className="wx-top">
        <span className="wx-icon" aria-hidden="true">{p.icon}</span>
        <span className="wx-temp">{Math.round(p.tempC)}°</span>
        <span className="wx-meta">
          <span className="wx-place">{p.place}</span>
          <span className="wx-cond">{p.condition}</span>
          <span className="wx-feels">Feels {Math.round(p.feelsC)}°</span>
        </span>
      </div>
      {p.forecast.length > 0 && (
        <div className="wx-days">
          {p.forecast.slice(0, 4).map((d) => (
            <div className="wx-day" key={d.date}>
              <span className="wx-day__d">{weekday(d.date)}</span>
              <span className="wx-day__i" aria-hidden="true">{d.icon}</span>
              <span className="wx-day__t">{Math.round(d.hiC)}°<small>/{Math.round(d.loC)}°</small></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export default WeatherCard;
