/**
 * Global Weather & Micro-Neighborhood Geocoding Service
 * Supports Korean Dong/Eup/Myeon/Ri level address search + Global cities
 */

export const WeatherAPI = {
  BASE_URL: 'https://api.open-meteo.com/v1/forecast',
  AIR_QUALITY_URL: 'https://air-quality-api.open-meteo.com/v1/air-quality',
  GEOCODING_URL: 'https://geocoding-api.open-meteo.com/v1/search',

  CACHE_PREFIX: 'weather_cache_v3_',
  CACHE_TTL_MS: 10 * 60 * 1000, // 10 minutes

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
   * Ultra-fast Forecast fetch (100~200ms)
   */
  async getForecast(lat, lon, timezone = 'auto') {
    const cacheKey = `forecast_${lat.toFixed(2)}_${lon.toFixed(2)}`;
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
   * Fast Air Quality fetch
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
   * Smart Multi-Source Location Search
   * 1. OpenStreetMap Nominatim / Photon (Korean Dong/Eup/Myeon/Ri level)
   * 2. Open-Meteo Geocoding (Global major cities)
   */
  async searchLocation(query) {
    if (!query || query.trim().length < 1) return [];
    const q = query.trim();
    const results = [];
    const seen = new Set();

    // 1. Photon Geocoding (Fast micro-dong and Korean neighborhoods)
    try {
      const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8`;
      const pRes = await fetch(photonUrl);
      if (pRes.ok) {
        const pData = await pRes.json();
        for (const feat of pData.features || []) {
          const props = feat.properties || {};
          const [lon, lat] = feat.geometry.coordinates;
          const key = `${lat.toFixed(3)}_${lon.toFixed(3)}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const name = props.name || props.district || props.city || q;
          const subParts = [props.city || props.district, props.state, props.country].filter(Boolean);
          // filter duplicates in subparts
          const subText = [...new Set(subParts)].join(' • ');

          results.push({
            name: name,
            subText: subText || '대한민국',
            latitude: lat,
            longitude: lon,
            country: props.country || '대한민국',
          });
        }
      }
    } catch (e) {
      console.warn('Photon 검색 실패:', e);
    }

    // 2. Open-Meteo Global Geocoding
    try {
      const omUrl = `${this.GEOCODING_URL}?name=${encodeURIComponent(q)}&count=6&language=ko&format=json`;
      const omRes = await fetch(omUrl);
      if (omRes.ok) {
        const omData = await omRes.json();
        for (const item of omData.results || []) {
          const key = `${item.latitude.toFixed(3)}_${item.longitude.toFixed(3)}`;
          if (seen.has(key)) continue;
          seen.add(key);

          results.push({
            name: item.name,
            subText: [item.admin1, item.country].filter(Boolean).join(' • '),
            latitude: item.latitude,
            longitude: item.longitude,
            country: item.country || '',
          });
        }
      }
    } catch (e) {
      console.warn('Open-Meteo 검색 실패:', e);
    }

    return results;
  },
};
