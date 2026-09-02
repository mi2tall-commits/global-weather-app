/**
 * Global Weather API Service with Offline Local Caching Support
 */

export const WeatherAPI = {
  BASE_URL: 'https://api.open-meteo.com/v1/forecast',
  ENSEMBLE_URL: 'https://ensemble-api.open-meteo.com/v1/ensemble',
  AIR_QUALITY_URL: 'https://air-quality-api.open-meteo.com/v1/air-quality',
  GEOCODING_URL: 'https://geocoding-api.open-meteo.com/v1/search',

  CACHE_PREFIX: 'weather_cache_',

  /**
   * Save payload to localStorage for offline access
   */
  saveToCache(key, data) {
    try {
      const payload = {
        timestamp: Date.now(),
        data: data
      };
      localStorage.setItem(this.CACHE_PREFIX + key, JSON.stringify(payload));
    } catch (e) {
      console.warn('캐시 저장 실패(용량 초과 등):', e);
    }
  },

  /**
   * Get cached payload from localStorage
   */
  getFromCache(key) {
    try {
      const raw = localStorage.getItem(this.CACHE_PREFIX + key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  },

  /**
   * Fetch primary forecast with automatic offline cache fallback
   */
  async getForecast(lat, lon, timezone = 'auto') {
    const cacheKey = `forecast_${lat.toFixed(2)}_${lon.toFixed(2)}`;
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
        'rain',
        'showers',
        'snowfall',
        'weather_code',
        'cloud_cover',
        'pressure_msl',
        'surface_pressure',
        'wind_speed_10m',
        'wind_direction_10m',
        'wind_gusts_10m',
      ].join(','),
      hourly: [
        'temperature_2m',
        'relative_humidity_2m',
        'dew_point_2m',
        'apparent_temperature',
        'precipitation_probability',
        'precipitation',
        'rain',
        'showers',
        'snowfall',
        'weather_code',
        'pressure_msl',
        'cloud_cover',
        'visibility',
        'wind_speed_10m',
        'wind_direction_10m',
        'wind_gusts_10m',
        'uv_index',
      ].join(','),
      daily: [
        'weather_code',
        'temperature_2m_max',
        'temperature_2m_min',
        'apparent_temperature_max',
        'apparent_temperature_min',
        'sunrise',
        'sunset',
        'uv_index_max',
        'precipitation_sum',
        'rain_sum',
        'showers_sum',
        'snowfall_sum',
        'precipitation_hours',
        'precipitation_probability_max',
        'wind_speed_10m_max',
        'wind_gusts_10m_max',
        'wind_direction_10m_dominant',
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
      console.warn('네트워크 요청 실패, 로컬 오프라인 캐시 탐색:', err);
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        cached.data._isCached = true;
        cached.data._cachedAt = cached.timestamp;
        return cached.data;
      }
      throw new Error('오프라인 상태이며 저장된 캐시 데이터가 없습니다.');
    }
  },

  /**
   * Fetch multi-model ensemble predictions with cache fallback
   */
  async getMultiModelForecast(lat, lon, timezone = 'auto') {
    const cacheKey = `multimodel_${lat.toFixed(2)}_${lon.toFixed(2)}`;
    const models = ['ecmwf_ifs025', 'gfs_seamless', 'icon_seamless', 'kma_gdaps', 'gem_seamless'];
    const params = new URLSearchParams({
      latitude: lat,
      longitude: lon,
      timezone: timezone,
      forecast_days: 10,
      models: models.join(','),
      hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code',
    });

    try {
      const res = await fetch(`${this.BASE_URL}?${params.toString()}`);
      if (!res.ok) return null;
      const data = await res.json();
      this.saveToCache(cacheKey, data);
      return data;
    } catch (err) {
      const cached = this.getFromCache(cacheKey);
      return cached ? cached.data : null;
    }
  },

  /**
   * Fetch Air Quality with cache fallback
   */
  async getAirQuality(lat, lon, timezone = 'auto') {
    const cacheKey = `airquality_${lat.toFixed(2)}_${lon.toFixed(2)}`;
    const params = new URLSearchParams({
      latitude: lat,
      longitude: lon,
      timezone: timezone,
      current: 'pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi,european_aqi',
      hourly: 'pm10,pm2_5,us_aqi',
      forecast_days: 5,
    });

    try {
      const res = await fetch(`${this.AIR_QUALITY_URL}?${params.toString()}`);
      if (!res.ok) return null;
      const data = await res.json();
      this.saveToCache(cacheKey, data);
      return data;
    } catch (err) {
      const cached = this.getFromCache(cacheKey);
      return cached ? cached.data : null;
    }
  },

  /**
   * Search location by query name
   */
  async searchLocation(query) {
    if (!query || query.trim().length < 2) return [];
    const params = new URLSearchParams({
      name: query.trim(),
      count: 10,
      language: 'ko',
      format: 'json',
    });

    try {
      const res = await fetch(`${this.GEOCODING_URL}?${params.toString()}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.results || [];
    } catch (err) {
      console.error('위치 검색 오류:', err);
      return [];
    }
  },
};
