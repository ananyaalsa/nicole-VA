// Frontend weather client (GET /api/weather). The ambient widget uses the
// browser's geolocation; the voice dialog can also fetch a named place.

export interface WeatherDay {
  date: string;
  hiC: number;
  loC: number;
  condition: string;
  icon: string;
}

export interface Weather {
  place: string;
  latitude: number;
  longitude: number;
  tempC: number;
  feelsC: number;
  condition: string;
  icon: string;
  humidity: number;
  windKph: number;
  isDay: boolean;
  forecast: WeatherDay[];
}

/** Ask the browser for coordinates (resolves null if denied/unavailable). */
export function getCoords(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 10 * 60 * 1000 },
    );
  });
}

export async function fetchWeatherAt(lat: number, lon: number): Promise<Weather> {
  const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
  if (!res.ok) throw new Error(`weather ${res.status}`);
  return res.json();
}

export async function fetchWeatherFor(place: string): Promise<Weather> {
  const res = await fetch(`/api/weather?q=${encodeURIComponent(place)}`);
  if (!res.ok) throw new Error(`weather ${res.status}`);
  return res.json();
}

/** A short spoken-style line (used as the system text Nicole reads back). */
export function speakWeather(w: Weather): string {
  return `It's ${w.tempC} degrees and ${w.condition.toLowerCase()} in ${w.place}, feels like ${w.feelsC}.`;
}
