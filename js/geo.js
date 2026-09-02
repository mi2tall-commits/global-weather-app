/**
 * Geolocation and Address Management Module
 */

export const GeoService = {
  DEFAULT_LOCATION: {
    name: '서울특별시 중구',
    country: '대한민국',
    latitude: 37.5665,
    longitude: 126.9780,
    timezone: 'Asia/Seoul',
  },

  /**
   * Request user's current GPS position via browser Geolocation API
   */
  async getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('브라우저가 GPS 위치 서비스를 지원하지 않습니다.'));
        return;
      }

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
              message = '위치 권한이 거부되었습니다. 주소를 직접 검색해 주세요.';
              break;
            case error.POSITION_UNAVAILABLE:
              message = '현재 위치 정보를 사용할 수 없습니다.';
              break;
            case error.TIMEOUT:
              message = '위치 요청 시간이 초과되었습니다.';
              break;
          }
          reject(new Error(message));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  },

  /**
   * Reverse Geocoding: Get human-readable Korean address from Lat/Lon
   */
  async reverseGeocode(lat, lon) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ko`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'GlobalWeatherConsensusApp/1.0' },
      });
      if (res.ok) {
        const data = await res.json();
        const addr = data.address || {};
        const parts = [];
        if (addr.province || addr.city || addr.state) parts.push(addr.city || addr.province || addr.state);
        if (addr.borough || addr.district || addr.suburb || addr.town) {
          parts.push(addr.borough || addr.district || addr.suburb || addr.town);
        }
        if (addr.quarter || addr.neighbourhood) parts.push(addr.quarter || addr.neighbourhood);

        const name = parts.length > 0 ? parts.join(' ') : (data.display_name.split(',')[0] || '현재 위치');
        const country = addr.country || '';
        return { name, country, latitude: lat, longitude: lon };
      }
    } catch (e) {
      console.warn('Nominatim 역지오코딩 실패, 보조 역지오코딩 시도:', e);
    }

    // Fallback using BigDataCloud free client API
    try {
      const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ko`;
      const res = await fetch(bdcUrl);
      if (res.ok) {
        const data = await res.json();
        const name = [data.principalSubdivision, data.locality || data.city].filter(Boolean).join(' ') || '현재 위치';
        return { name, country: data.countryName || '', latitude: lat, longitude: lon };
      }
    } catch (err) {
      console.warn('보조 역지오코딩 실패:', err);
    }

    return {
      name: `위도 ${lat.toFixed(3)}, 경도 ${lon.toFixed(3)}`,
      country: '',
      latitude: lat,
      longitude: lon,
    };
  },

  /**
   * LocalStorage Favorites Management
   */
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
