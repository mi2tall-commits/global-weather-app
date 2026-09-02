/**
 * Geolocation and Address Management Module
 * Optimized for Safari iOS/macOS & Instant IP-based Fallback
 */

export const GeoService = {
  DEFAULT_LOCATION: {
    name: '현재 위치 파악 중...',
    country: '대한민국',
    latitude: 37.5665,
    longitude: 126.9780,
    timezone: 'Asia/Seoul',
  },

  /**
   * Fast IP-based initial geolocation (Zero-delay, works in Safari without permission blocks)
   */
  async getInitialLocation() {
    // 1. Check last saved location in localStorage
    try {
      const saved = localStorage.getItem('last_user_location');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {}

    // 2. Fast IP Geolocation (50ms response)
    try {
      const res = await fetch('https://get.geojs.io/v1/ip/geo.json');
      if (res.ok) {
        const data = await res.json();
        const lat = parseFloat(data.latitude);
        const lon = parseFloat(data.longitude);
        const cityName = data.city || data.region || '현재 위치';
        const country = data.country || '대한민국';
        const loc = {
          name: `${cityName}`,
          country: country,
          latitude: lat,
          longitude: lon,
          timezone: data.timezone || 'auto',
        };
        localStorage.setItem('last_user_location', JSON.stringify(loc));
        return loc;
      }
    } catch (err) {
      console.warn('IP Geolocation fallback failed:', err);
    }

    return {
      name: '서울특별시 중구',
      country: '대한민국',
      latitude: 37.5665,
      longitude: 126.9780,
      timezone: 'Asia/Seoul',
    };
  },

  /**
   * Accurate GPS position via browser Geolocation API (Optimized for Safari)
   */
  async getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('브라우저가 GPS 위치 서비스를 지원하지 않습니다.'));
        return;
      }

      // Fast resolution with reasonable accuracy to prevent Safari 10s GPS lag
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        },
        (error) => {
          let message = '위치 정보를 가져올 수 없습니다.';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              message = '사파리(브라우저) 위치 권한이 비활성화되어 있습니다. 설정에서 위치 접근을 허용해 주시거나 검색을 이용해 주세요.';
              break;
            case error.POSITION_UNAVAILABLE:
              message = '현재 GPS 위치 신호를 잡을 수 없습니다.';
              break;
            case error.TIMEOUT:
              message = 'GPS 응답 시간이 초과되었습니다.';
              break;
          }
          reject(new Error(message));
        },
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 }
      );
    });
  },

  /**
   * Reverse Geocoding with fast Korean address parsing
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
      const res = await fetch(url, { headers: { 'User-Agent': 'GlobalWeatherConsensusApp/1.1' } });
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
