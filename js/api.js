/**
 * Global Weather API Service
 * High-performance, low-latency API communication with intelligent caching
 */

export const WeatherAPI = {
  BASE_URL: 'https://api.open-meteo.com/v1/forecast',
  AIR_QUALITY_URL: 'https://air-quality-api.open-meteo.com/v1/air-quality',
  GEOCODING_URL: 'https://geocoding-api.open-meteo.com/v1/search',

  CACHE_PREFIX: 'weather_cache_v2_',
  CACHE_TTL_MS: 10 * 60 * 1000, // 10 minutes cache

  saveToCache(key, data) {
    try {
      const payload = { timestamp: Date.now(), data: data };
      localStorage.setItem(this.CACHE_PREFIX + key, JSON.stringify(payload));
    } catch (e) {}
  },

  getFromCache(key, maxAge = this.CACHE_TTL_MS) {
    try {
      const raw = localStorage.getItem(this.CACHE_PREFIX + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.timestamp < maxAge) {
        return parsed;
      }
      return null;
    } catch (e) {
      return null;
    }
  },

  /**
   * Ultra-fast Forecast fetch (100~200ms response time)
   */
  async getForecast(lat, lon, timezone = 'auto') {
    const cacheKey = `forecast_${lat.toFixed(2)}_${lon.toFixed(2)}`;
    
    // Check fresh cache first for instantaneous render
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      cached.data._isCached = true;
      cached.data._cachedAt = cached.timestamp;
      return cached.data;
    }

    const params = new URLSearchParams({
      latitude: lat,
      longitude: lon,
      timezone: timezone,
      forecast_days: 16,
      current: [
        'temperature_2m',
        'relative_humidity_2m',
        'apparent_temperature',
        'is_day',
        'precipitation',
        'weather_code',
        'surface_pressure',
        'wind_speed_10m',
        'wind_direction_10m',
        'wind_gusts_10m',
      ].join(','),
      hourly: [
        'temperature_2m',
        'relative_humidity_2m',
        'apparent_temperature',
        'precipitation_probability',
        'precipitation',
        'weather_code',
        'wind_speed_10m',
        'wind_direction_10m',
        'uv_index',
      ].join(','),
      daily: [
        'weather_code',
        'temperature_2m_max',
        'temperature_2m_min',
        'sunrise',
        'sunset',
        'uv_index_max',
        'precipitation_sum',
        'precipitation_probability_max',
        'wind_speed_10m_max',
      ].join(','),
    });

    try {
      const res = await fetch(`${this.BASE_URL}?${params.toString()}`);
      if (!res.ok) throw new Error(`기상 예보 페칭 오류 (${res.status})`);
      const data = await res.json();
      this.saveToCache(cacheKey, data);
      data._isCached = false;
      return data;
    } catch (err) {
      // If offline or failed, fallback to any existing cache
      const oldCache = this.getFromCache(cacheKey, 7 * 24 * 3600 * 1000);
      if (oldCache) {
        oldCache.data._isCached = true;
        oldCache.data._cachedAt = oldCache.timestamp;
        return oldCache.data;
      }
      throw err;
    }
  },

  /**
   * Fast Air Quality fetch (PM10, PM2.5)
   */
  async getAirQuality(lat, lon, timezone = 'auto') {
    const cacheKey = `air_${lat.toFixed(2)}_${lon.toFixed(2)}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached.data;

    const params = new URLSearchParams({
      latitude: lat,
      longitude: lon,
      timezone: timezone,
      current: 'pm10,pm2_5',
      forecast_days: 1,
    });

    try {
      const res = await fetch(`${this.AIR_QUALITY_URL}?${params.toString()}`);
      if (!res.ok) return null;
      const data = await res.json();
      this.saveToCache(cacheKey, data);
      return data;
    } catch (err) {
      return null;
    }
  },

  /**
   * Fast location search
   */
  async searchLocation(query) {
    if (!query || query.trim().length < 2) return [];
    const params = new URLSearchParams({
      name: query.trim(),
      count: 8,
      language: 'ko',
      format: 'json',
    });

    try {
      const res = await fetch(`${this.GEOCODING_URL}?${params.toString()}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.results || [];
    } catch (err) {
      return [];
    }
  },
};
