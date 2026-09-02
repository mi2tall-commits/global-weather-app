/**
 * Geolocation and Address Management Module
 * Ultra-resilient Safari iOS / Mobile GPS with Smart IP Fallback
 */

export const GeoService = {
  DEFAULT_LOCATION: {
    name: '현재 위치',
    country: '대한민국',
    latitude: 37.5665,
    longitude: 126.9780,
    timezone: 'Asia/Seoul',
  },

  /**
   * Fast IP Geolocation (Always works as a reliable backup)
   */
  async getIpLocation() {
    try {
      const res = await fetch('https://get.geojs.io/v1/ip/geo.json');
      if (res.ok) {
        const data = await res.json();
        return {
          name: data.city || data.region || '현재 위치',
          country: data.country || '대한민국',
          latitude: parseFloat(data.latitude),
          longitude: parseFloat(data.longitude),
          timezone: data.timezone || 'auto',
          isIp: true,
        };
      }
    } catch (e) {}

    try {
      const res2 = await fetch('https://ipapi.co/json/');
      if (res2.ok) {
        const data = await res2.json();
        return {
          name: data.city || data.region || '현재 위치',
          country: data.country_name || '대한민국',
          latitude: parseFloat(data.latitude),
          longitude: parseFloat(data.longitude),
          timezone: data.timezone || 'auto',
          isIp: true,
        };
      }
    } catch (e) {}

    return this.DEFAULT_LOCATION;
  },

  /**
   * Fast initial location
   */
  async getInitialLocation() {
    try {
      const saved = localStorage.getItem('last_user_location');
      if (saved) return JSON.parse(saved);
    } catch (e) {}

    return await this.getIpLocation();
  },

  /**
   * iOS Safari Optimized GPS Position
   * Tries fast cached GPS -> Precise GPS -> IP Fallback (Zero crash guarantee)
   */
  async getCurrentPosition() {
    if (!navigator.geolocation) {
      return await this.getIpLocation();
    }

    // Promise wrapper with graceful timeout
    const tryGetPos = (options) => {
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            isGps: true,
          }),
          (err) => reject(err),
          options
        );
      });
    };

    try {
      // 1. First attempt: Fast network/cell location (Low battery, fast on iOS)
      return await tryGetPos({ enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 });
    } catch (err1) {
      try {
        // 2. Second attempt: Direct hardware GPS
        return await tryGetPos({ enableHighAccuracy: true, timeout: 8000, maximumAge: 0 });
      } catch (err2) {
        console.warn('GPS 응답 지연/제한으로 IP 정밀 위치로 대체합니다:', err2);
        // 3. Third attempt: Seamless IP fallback (never show breaking alert)
        const ipLoc = await this.getIpLocation();
        return {
          latitude: ipLoc.latitude,
          longitude: ipLoc.longitude,
          isIpFallback: true,
        };
      }
    }
  },

  /**
   * Reverse Geocoding with Korean administrative district mapping
   */
  async reverseGeocode(lat, lon) {
    try {
      const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ko`;
      const res = await fetch(bdcUrl);
      if (res.ok) {
        const data = await res.json();
        const parts = [data.principalSubdivision, data.locality || data.city].filter(Boolean);
        const name = parts.length > 0 ? parts.join(' ') : '내 위치';
        return { name, country: data.countryName || '대한민국', latitude: lat, longitude: lon };
      }
    } catch (e) {}

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ko`;
      const res = await fetch(url, { headers: { 'User-Agent': 'GlobalWeatherConsensusApp/1.2' } });
      if (res.ok) {
        const data = await res.json();
        const addr = data.address || {};
        const parts = [addr.province || addr.city || addr.state, addr.borough || addr.district || addr.suburb || addr.town].filter(Boolean);
        const name = parts.length > 0 ? parts.join(' ') : '내 위치';
        return { name, country: addr.country || '', latitude: lat, longitude: lon };
      }
    } catch (err) {}

    return {
      name: `위도 ${lat.toFixed(2)}°, 경도 ${lon.toFixed(2)}°`,
      country: '',
      latitude: lat,
      longitude: lon,
    };
  },

  getFavorites() {
    try {
      const data = localStorage.getItem('weather_fav_locations');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveFavorite(loc) {
    const favs = this.getFavorites();
    if (!favs.some(f => Math.abs(f.latitude - loc.latitude) < 0.01 && Math.abs(f.longitude - loc.longitude) < 0.01)) {
      favs.push({
        id: Date.now(),
        name: loc.name,
        country: loc.country || '',
        latitude: loc.latitude,
        longitude: loc.longitude,
      });
      localStorage.setItem('weather_fav_locations', JSON.stringify(favs));
    }
    return this.getFavorites();
  },

  removeFavorite(id) {
    const favs = this.getFavorites().filter(f => f.id !== id);
    localStorage.setItem('weather_fav_locations', JSON.stringify(favs));
    return favs;
  },
};
