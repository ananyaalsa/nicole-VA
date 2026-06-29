// Weather service backed by Open-Meteo (free, no API key). Two entry points:
//   - by coordinates (the ambient widget uses the browser's geolocation)
//   - by place name (Nicole resolves "weather in Tokyo" → geocode → forecast)
// Returns a compact, UI-and-speech-friendly shape.

export interface WeatherNow {
  /** Resolved place label, e.g. "Dubai, United Arab Emirates" or "your area". */
  place: string;
  latitude: number;
  longitude: number;
  /** Current temperature in °C (rounded). */
  tempC: number;
  /** "Feels like" in °C (rounded). */
  feelsC: number;
  /** Short human condition, e.g. "Clear sky", "Light rain". */
  condition: string;
  /** Emoji matching the condition + day/night. */
  icon: string;
  humidity: number;
  windKph: number;
  isDay: boolean;
  /** Next few days. */
  forecast: WeatherDay[];
}

export interface WeatherDay {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  hiC: number;
  loC: number;
  condition: string;
  icon: string;
}

/** WMO weather-code → (label, day emoji, night emoji). */
const WMO: Record<number, [string, string, string]> = {
  0: ['Clear sky', '☀️', '🌙'],
  1: ['Mainly clear', '🌤️', '🌙'],
  2: ['Partly cloudy', '⛅', '☁️'],
  3: ['Overcast', '☁️', '☁️'],
  45: ['Fog', '🌫️', '🌫️'],
  48: ['Rime fog', '🌫️', '🌫️'],
  51: ['Light drizzle', '🌦️', '🌧️'],
  53: ['Drizzle', '🌦️', '🌧️'],
  55: ['Heavy drizzle', '🌧️', '🌧️'],
  61: ['Light rain', '🌦️', '🌧️'],
  63: ['Rain', '🌧️', '🌧️'],
  65: ['Heavy rain', '🌧️', '🌧️'],
  66: ['Freezing rain', '🌧️', '🌧️'],
  67: ['Freezing rain', '🌧️', '🌧️'],
  71: ['Light snow', '🌨️', '🌨️'],
  73: ['Snow', '❄️', '❄️'],
  75: ['Heavy snow', '❄️', '❄️'],
  77: ['Snow grains', '🌨️', '🌨️'],
  80: ['Rain showers', '🌦️', '🌧️'],
  81: ['Rain showers', '🌧️', '🌧️'],
  82: ['Violent showers', '⛈️', '⛈️'],
  85: ['Snow showers', '🌨️', '🌨️'],
  86: ['Snow showers', '❄️', '❄️'],
  95: ['Thunderstorm', '⛈️', '⛈️'],
  96: ['Thunderstorm, hail', '⛈️', '⛈️'],
  99: ['Thunderstorm, hail', '⛈️', '⛈️'],
};

function decode(code: number, isDay: boolean): { condition: string; icon: string } {
  const e = WMO[code] ?? ['Unknown', '🌡️', '🌡️'];
  return { condition: e[0], icon: isDay ? e[1] : e[2] };
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Nicole2.0' } });
  if (!res.ok) throw new Error(`weather ${res.status}`);
  return res.json();
}

/** Geocode a place name → coordinates + a readable label. */
export async function geocodePlace(
  query: string,
): Promise<{ latitude: number; longitude: number; place: string } | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
  const data = await getJson(url);
  const hit = data.results?.[0];
  if (!hit) return null;
  const label = [hit.name, hit.admin1, hit.country].filter(Boolean).join(', ');
  return { latitude: hit.latitude, longitude: hit.longitude, place: label };
}

/** Fetch current weather + a short forecast for coordinates. */
export async function weatherAt(
  latitude: number,
  longitude: number,
  place = 'Your Area',
): Promise<WeatherNow> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=4`;
  const d = await getJson(url);
  const cur = d.current ?? {};
  const isDay = cur.is_day === 1;
  const { condition, icon } = decode(Number(cur.weather_code ?? 0), isDay);

  const daily = d.daily ?? {};
  const forecast: WeatherDay[] = (daily.time ?? []).slice(0, 4).map((date: string, i: number) => {
    const dc = decode(Number(daily.weather_code?.[i] ?? 0), true);
    return {
      date,
      hiC: Math.round(daily.temperature_2m_max?.[i] ?? 0),
      loC: Math.round(daily.temperature_2m_min?.[i] ?? 0),
      condition: dc.condition,
      icon: dc.icon,
    };
  });

  return {
    place,
    latitude,
    longitude,
    tempC: Math.round(cur.temperature_2m ?? 0),
    feelsC: Math.round(cur.apparent_temperature ?? cur.temperature_2m ?? 0),
    condition,
    icon,
    humidity: Math.round(cur.relative_humidity_2m ?? 0),
    windKph: Math.round(cur.wind_speed_10m ?? 0),
    isDay,
    forecast,
  };
}

/** A short, speakable one-liner for Nicole. */
export function speakWeather(w: WeatherNow): string {
  return `It's ${w.tempC} degrees and ${w.condition.toLowerCase()} in ${w.place}, feels like ${w.feelsC}.`;
}
