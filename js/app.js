import { WeatherAPI } from './api.js';
import { EnsembleEngine } from './ensemble.js';
import { GeoService } from './geo.js';
import { GeminiAI } from './ai.js';

class WeatherApp {
  constructor() {
    this.currentLocation = GeoService.DEFAULT_LOCATION;
    this.forecastData = null;
    this.airQualityData = null;
    this.hourlyInterval = 1; // 1 or 3
    this.selectedDayIndex = 0; // 0 = today
    this.searchDebounceTimer = null;

    this.initElements();
    this.bindEvents();
    this.initServiceWorker();
    this.initOnlineStatus();
  }

  initElements() {
    this.elements = {
      locationName: document.getElementById('locationName'),
      locationSub: document.getElementById('locationSub'),
      gpsBtn: document.getElementById('gpsBtn'),
      favBtn: document.getElementById('favBtn'),
      favList: document.getElementById('favList'),
      searchInput: document.getElementById('searchInput'),
      searchResults: document.getElementById('searchResults'),
      loadingOverlay: document.getElementById('loadingOverlay'),
      offlineNotice: document.getElementById('offlineNotice'),

      // Gemini AI Elements
      geminiSettingsBtn: document.getElementById('geminiSettingsBtn'),
      geminiModal: document.getElementById('geminiModal'),
      geminiApiKeyInput: document.getElementById('geminiApiKeyInput'),
      geminiSaveKeyBtn: document.getElementById('geminiSaveKeyBtn'),
      geminiCloseModalBtn: document.getElementById('geminiCloseModalBtn'),
      geminiKeyStatus: document.getElementById('geminiKeyStatus'),
      geminiBriefingBtn: document.getElementById('geminiBriefingBtn'),
      geminiBriefingCard: document.getElementById('geminiBriefingCard'),
      geminiBriefingContent: document.getElementById('geminiBriefingContent'),
      geminiChatInput: document.getElementById('geminiChatInput'),
      geminiChatSendBtn: document.getElementById('geminiChatSendBtn'),
      geminiChatMessages: document.getElementById('geminiChatMessages'),

      // Consensus & Alerts
      consensusCard: document.getElementById('consensusCard'),
      consensusText: document.getElementById('consensusText'),
      consensusBadge: document.getElementById('consensusBadge'),
      severeAlertBanner: document.getElementById('severeAlertBanner'),

      // Current Weather
      currentTemp: document.getElementById('currentTemp'),
      currentDesc: document.getElementById('currentDesc'),
      currentIcon: document.getElementById('currentIcon'),
      currentApparent: document.getElementById('currentApparent'),
      currentHumidity: document.getElementById('currentHumidity'),
      currentWind: document.getElementById('currentWind'),
      currentPrecip: document.getElementById('currentPrecip'),
      currentPressure: document.getElementById('currentPressure'),
      updateTime: document.getElementById('updateTime'),

      // Lifestyle & Air Quality Cards
      umbrellaCard: document.getElementById('umbrellaCard'),
      outfitCard: document.getElementById('outfitCard'),
      carwashCard: document.getElementById('carwashCard'),
      outdoorCard: document.getElementById('outdoorCard'),
      airQualityCard: document.getElementById('airQualityCard'),

      // Hourly Timeline
      interval1hBtn: document.getElementById('interval1hBtn'),
      interval3hBtn: document.getElementById('interval3hBtn'),
      hourlyTimelineContainer: document.getElementById('hourlyTimelineContainer'),

      // Daily Forecast
      dailyCardsContainer: document.getElementById('dailyCardsContainer'),
    };
  }

  bindEvents() {
    if (this.elements.gpsBtn) {
      this.elements.gpsBtn.addEventListener('click', () => this.handleGPSClick());
    }

    if (this.elements.searchInput) {
      this.elements.searchInput.addEventListener('input', (e) => {
        clearTimeout(this.searchDebounceTimer);
        const query = e.target.value.trim();
        if (query.length < 2) {
          if (this.elements.searchResults) this.elements.searchResults.classList.add('hidden');
          return;
        }
        this.searchDebounceTimer = setTimeout(() => this.handleSearch(query), 250);
      });
    }

    document.addEventListener('click', (e) => {
      if (this.elements.searchInput && this.elements.searchResults) {
        if (!this.elements.searchInput.contains(e.target) && !this.elements.searchResults.contains(e.target)) {
          this.elements.searchResults.classList.add('hidden');
        }
      }
    });

    if (this.elements.interval1hBtn) this.elements.interval1hBtn.addEventListener('click', () => this.setInterval(1));
    if (this.elements.interval3hBtn) this.elements.interval3hBtn.addEventListener('click', () => this.setInterval(3));
    if (this.elements.favBtn) this.elements.favBtn.addEventListener('click', () => this.toggleFavorite());

    // Gemini AI Events
    if (this.elements.geminiSettingsBtn) this.elements.geminiSettingsBtn.addEventListener('click', () => this.openGeminiModal());
    if (this.elements.geminiCloseModalBtn) this.elements.geminiCloseModalBtn.addEventListener('click', () => this.closeGeminiModal());
    if (this.elements.geminiSaveKeyBtn) this.elements.geminiSaveKeyBtn.addEventListener('click', () => this.saveGeminiKey());
    if (this.elements.geminiBriefingBtn) this.elements.geminiBriefingBtn.addEventListener('click', () => this.triggerGeminiBriefing());
    if (this.elements.geminiChatSendBtn) this.elements.geminiChatSendBtn.addEventListener('click', () => this.sendGeminiChat());
    if (this.elements.geminiChatInput) {
      this.elements.geminiChatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.sendGeminiChat();
      });
    }
  }

  initServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('Service Worker 등록 완료 (오프라인 캐싱 활성화)'))
        .catch((err) => console.warn('Service Worker 등록 실패:', err));
    }
  }

  initOnlineStatus() {
    const updateStatus = () => {
      if (!this.elements.offlineNotice) return;
      if (!navigator.onLine) {
        this.elements.offlineNotice.classList.remove('hidden');
      } else {
        if (!this.forecastData?._isCached) {
          this.elements.offlineNotice.classList.add('hidden');
        }
      }
    };
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    updateStatus();
  }

  async init() {
    this.renderFavorites();
    this.updateGeminiKeyStatus();

    // 1. Instant Location Detection
    const initialLoc = await GeoService.getInitialLocation();
    this.currentLocation = initialLoc;

    // 2. Load weather immediately
    await this.loadWeather(
      initialLoc.latitude,
      initialLoc.longitude,
      initialLoc.name,
      initialLoc.country
    );
  }

  showLoading(show = true) {
    if (this.elements.loadingOverlay) {
      if (show) this.elements.loadingOverlay.classList.remove('hidden');
      else this.elements.loadingOverlay.classList.add('hidden');
    }
  }

  async handleGPSClick() {
    try {
      this.showLoading(true);
      const coords = await GeoService.getCurrentPosition();
      const geoInfo = await GeoService.reverseGeocode(coords.latitude, coords.longitude);
      
      const loc = {
        name: geoInfo.name,
        country: geoInfo.country,
        latitude: coords.latitude,
        longitude: coords.longitude,
      };
      localStorage.setItem('last_user_location', JSON.stringify(loc));
      await this.loadWeather(coords.latitude, coords.longitude, geoInfo.name, geoInfo.country);
    } catch (err) {
      console.warn('GPS 핸들러 예외:', err);
    } finally {
      this.showLoading(false);
    }
  }

  async handleSearch(query) {
    const results = await WeatherAPI.searchLocation(query);
    if (!this.elements.searchResults) return;

    if (!results || results.length === 0) {
      this.elements.searchResults.innerHTML = `
        <div class="p-3 text-sm text-slate-400 text-center">검색 결과가 없습니다.</div>
      `;
      this.elements.searchResults.classList.remove('hidden');
      return;
    }

    this.elements.searchResults.innerHTML = results.map(r => `
      <div class="p-3 hover:bg-white/10 cursor-pointer border-b border-white/5 last:border-0 flex items-center justify-between text-left transition"
           data-lat="${r.latitude}" data-lon="${r.longitude}" data-name="${r.name}" data-country="${r.country || ''}" data-admin="${r.admin1 || ''}">
        <div>
          <div class="font-medium text-white">${r.name}</div>
          <div class="text-xs text-slate-400">${[r.admin1, r.country].filter(Boolean).join(', ')}</div>
        </div>
        <span class="text-xs text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded">선택</span>
      </div>
    `).join('');

    this.elements.searchResults.querySelectorAll('div[data-lat]').forEach(item => {
      item.addEventListener('click', () => {
        const lat = parseFloat(item.getAttribute('data-lat'));
        const lon = parseFloat(item.getAttribute('data-lon'));
        const name = item.getAttribute('data-name');
        const country = item.getAttribute('data-country');
        const admin = item.getAttribute('data-admin');
        const fullName = admin ? `${admin} ${name}` : name;

        if (this.elements.searchInput) this.elements.searchInput.value = '';
        this.elements.searchResults.classList.add('hidden');
        
        const loc = { name: fullName, country, latitude: lat, longitude: lon };
        localStorage.setItem('last_user_location', JSON.stringify(loc));
        this.loadWeather(lat, lon, fullName, country);
      });
    });

    this.elements.searchResults.classList.remove('hidden');
  }

  async loadWeather(lat, lon, name, country = '') {
    try {
      this.showLoading(true);
      this.currentLocation = { latitude: lat, longitude: lon, name, country };

      if (this.elements.locationName) this.elements.locationName.textContent = name;
      if (this.elements.locationSub) {
        this.elements.locationSub.textContent = country ? `${country} • 위도 ${lat.toFixed(2)}°, 경도 ${lon.toFixed(2)}°` : `위도 ${lat.toFixed(2)}°, 경도 ${lon.toFixed(2)}°`;
      }

      const [forecastRaw, airQualityRaw] = await Promise.all([
        WeatherAPI.getForecast(lat, lon),
        WeatherAPI.getAirQuality(lat, lon),
      ]);

      this.forecastData = EnsembleEngine.synthesizeForecast(forecastRaw);
      this.airQualityData = airQualityRaw;

      // Offline banner notice
      if (this.elements.offlineNotice) {
        if (this.forecastData._isCached) {
          const cachedTimeStr = this.forecastData._cachedAt ? new Date(this.forecastData._cachedAt).toLocaleTimeString('ko-KR') : '';
          this.elements.offlineNotice.innerHTML = `📡 <b>오프라인 캐시 모드:</b> 최근 저장된 예보(${cachedTimeStr})를 표시하고 있습니다.`;
          this.elements.offlineNotice.classList.remove('hidden');
        } else {
          this.elements.offlineNotice.classList.add('hidden');
        }
      }

      this.renderAll();
    } catch (err) {
      console.error('날씨 데이터 로드 실패:', err);
    } finally {
      this.showLoading(false);
    }
  }

  renderAll() {
    this.renderCurrentWeather();
    this.renderConsensusAndAlerts();
    this.renderLifestyleIndices();
    this.renderHourlyTimeline();
    this.renderDailyForecast();
    this.updateFavButtonState();
  }

  renderCurrentWeather() {
    if (!this.forecastData?.current) return;
    const cur = this.forecastData.current;
    if (this.elements.currentTemp) this.elements.currentTemp.textContent = `${cur.temp}°`;
    if (this.elements.currentDesc) this.elements.currentDesc.textContent = cur.weatherDesc;
    if (this.elements.currentIcon) this.elements.currentIcon.textContent = cur.weatherIcon;
    if (this.elements.currentApparent) this.elements.currentApparent.textContent = `${cur.apparentTemp}°C`;
    if (this.elements.currentHumidity) this.elements.currentHumidity.textContent = `${cur.humidity}%`;
    if (this.elements.currentWind) this.elements.currentWind.textContent = `${cur.windSpeed} km/h (순간 ${cur.windGusts})`;
    if (this.elements.currentPrecip) this.elements.currentPrecip.textContent = `${cur.precip} mm`;
    if (this.elements.currentPressure) this.elements.currentPressure.textContent = `${cur.pressure} hPa`;

    const now = new Date();
    if (this.elements.updateTime) {
      this.elements.updateTime.textContent = `기준: ${now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;
    }
  }

  renderConsensusAndAlerts() {
    if (!this.forecastData?.consensusInsight) return;
    const insight = this.forecastData.consensusInsight;
    if (this.elements.consensusText) this.elements.consensusText.textContent = insight.summaryText;
    if (this.elements.consensusBadge) {
      this.elements.consensusBadge.className = `text-xs px-2.5 py-1 rounded-full font-medium border ${insight.agreementBadge}`;
      this.elements.consensusBadge.textContent = `글로벌 모델 일치도: ${insight.agreementLevel}`;
    }

    const next24 = this.forecastData.timeline.slice(0, 24);
    const maxWind = Math.max(...next24.map(h => h.windSpeed));
    const maxPrecip = Math.max(...next24.map(h => h.precip));
    const maxTemp = Math.max(...next24.map(h => h.temp));
    const minTemp = Math.min(...next24.map(h => h.temp));

    const alerts = [];
    if (maxPrecip >= 20 || insight.totalPrecip24h >= 40) {
      alerts.push('⚠️ [호우 주의보] 24시간 내 강한 집중 호우가 예상됩니다. 침수 및 안전사고에 유의하세요.');
    } else if (maxWind >= 50) {
      alerts.push('💨 [강풍 주의보] 순간 최대 풍속 50km/h 이상의 강한 바람이 불겠습니다. 시설물 관리에 주의하세요.');
    } else if (maxTemp >= 33) {
      alerts.push('🔥 [폭염 주의] 낮 최고기온 33°C 이상의 무더위가 예상됩니다. 충분한 수분을 섭취하세요.');
    } else if (minTemp <= -10) {
      alerts.push('❄️ [한파 주의] 최저기온 영하 10°C 이하의 강추위가 예상됩니다. 동파 예방에 유의하세요.');
    }

    if (this.elements.severeAlertBanner) {
      if (alerts.length > 0) {
        this.elements.severeAlertBanner.innerHTML = alerts.map(a => `<div class="p-3 bg-amber-500/20 border border-amber-500/40 text-amber-200 rounded-xl text-sm font-medium mb-2">${a}</div>`).join('');
        this.elements.severeAlertBanner.classList.remove('hidden');
      } else {
        this.elements.severeAlertBanner.classList.add('hidden');
        this.elements.severeAlertBanner.innerHTML = '';
      }
    }
  }

  renderLifestyleIndices() {
    if (!this.forecastData?.timeline) return;
    const next24 = this.forecastData.timeline.slice(0, 24);
    const maxPop = Math.max(...next24.map(h => h.pop));
    const totalRain = next24.reduce((sum, h) => sum + h.precip, 0);
    const avgTemp = Math.round(next24.reduce((sum, h) => sum + h.temp, 0) / next24.length);

    // 1. Umbrella
    let umbrellaText = '우산 필요 없음 (맑음)';
    let umbrellaIcon = '🌂';
    let umbrellaColor = 'text-emerald-400';
    if (maxPop >= 70 || totalRain >= 5) {
      umbrellaText = '우산 필수 지참 (비/소나기)';
      umbrellaIcon = '☔';
      umbrellaColor = 'text-rose-400';
    } else if (maxPop >= 40 || totalRain > 0.5) {
      umbrellaText = '접이식 우산 추천 (강수확률 ' + maxPop + '%)';
      umbrellaIcon = '🌂';
      umbrellaColor = 'text-amber-400';
    }
    if (this.elements.umbrellaCard) {
      this.elements.umbrellaCard.innerHTML = `
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs text-slate-400">우산 지수</span>
          <span class="text-xl">${umbrellaIcon}</span>
        </div>
        <div class="font-semibold text-sm ${umbrellaColor}">${umbrellaText}</div>
      `;
    }

    // 2. Outfit Recommendation
    let outfitText = '';
    let outfitIcon = '👕';
    if (avgTemp >= 28) outfitText = '민소매, 반팔, 린넨 옷차림';
    else if (avgTemp >= 23) outfitText = '반팔, 얇은 셔츠, 반바지';
    else if (avgTemp >= 20) outfitText = '얇은 가디건, 긴팔티, 슬랙스';
    else if (avgTemp >= 17) outfitText = '자켓, 셔츠, 니트, 면바지';
    else if (avgTemp >= 12) outfitText = '가죽자켓, 트렌치코트, 니트';
    else if (avgTemp >= 9) outfitText = '코트, 점퍼, 기모바지';
    else if (avgTemp >= 5) outfitText = '울코트, 가죽옷, 발열내의';
    else { outfitText = '패딩, 두꺼운 코트, 목도리/장갑'; outfitIcon = '🧥'; }

    if (this.elements.outfitCard) {
      this.elements.outfitCard.innerHTML = `
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs text-slate-400">옷차림 추천 (${avgTemp}°C)</span>
          <span class="text-xl">${outfitIcon}</span>
        </div>
        <div class="font-semibold text-sm text-indigo-200">${outfitText}</div>
      `;
    }

    // 3. Carwash & Laundry
    let carwashText = '세차 적합 (3일간 비 없음)';
    let carwashColor = 'text-emerald-400';
    const next3DaysRain = this.forecastData.dailyItems.slice(0, 3).some(d => d.maxPop >= 40 || d.precipSum > 1);
    if (next3DaysRain) {
      carwashText = '세차 보류 권장 (비 예보)';
      carwashColor = 'text-rose-400';
    }
    if (this.elements.carwashCard) {
      this.elements.carwashCard.innerHTML = `
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs text-slate-400">세차 / 빨래 지수</span>
          <span class="text-xl">🚗</span>
        </div>
        <div class="font-semibold text-sm ${carwashColor}">${carwashText}</div>
      `;
    }

    // 4. Outdoor Running
    const maxWind = Math.max(...next24.map(h => h.windSpeed));
    let outdoorText = '야외 운동 매우 좋음';
    let outdoorColor = 'text-emerald-400';
    if (totalRain > 2 || maxWind > 35) {
      outdoorText = '실내 운동 권장 (비/강풍)';
      outdoorColor = 'text-rose-400';
    } else if (avgTemp >= 30) {
      outdoorText = '야간 운동 권장 (폭염)';
      outdoorColor = 'text-amber-400';
    }
    if (this.elements.outdoorCard) {
      this.elements.outdoorCard.innerHTML = `
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs text-slate-400">야외 활동 지수</span>
          <span class="text-xl">🏃</span>
        </div>
        <div class="font-semibold text-sm ${outdoorColor}">${outdoorText}</div>
      `;
    }

    // 5. Air Quality & UV
    let aqiText = '대기질 연동 중';
    let aqiColor = 'text-slate-300';
    if (this.airQualityData && this.airQualityData.current) {
      const pm10 = Math.round(this.airQualityData.current.pm10 || 0);
      const pm25 = Math.round(this.airQualityData.current.pm2_5 || 0);
      let grade = '좋음 🟢';
      aqiColor = 'text-emerald-400';
      if (pm25 > 75 || pm10 > 150) { grade = '매우 나쁨 🔴'; aqiColor = 'text-rose-400'; }
      else if (pm25 > 35 || pm10 > 80) { grade = '나쁨 🟡'; aqiColor = 'text-amber-400'; }
      else if (pm25 > 15 || pm10 > 30) { grade = '보통 🔵'; aqiColor = 'text-blue-400'; }

      aqiText = `미세 ${pm10}㎍ / 초미세 ${pm25}㎍ (${grade})`;
    }
    if (this.elements.airQualityCard) {
      this.elements.airQualityCard.innerHTML = `
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs text-slate-400">미세먼지 / 대기질</span>
          <span class="text-xl">🍃</span>
        </div>
        <div class="font-semibold text-sm ${aqiColor}">${aqiText}</div>
      `;
    }
  }

  setInterval(interval) {
    this.hourlyInterval = interval;
    if (this.elements.interval1hBtn && this.elements.interval3hBtn) {
      if (interval === 1) {
        this.elements.interval1hBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white shadow cursor-pointer';
        this.elements.interval3hBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white cursor-pointer';
      } else {
        this.elements.interval3hBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white shadow cursor-pointer';
        this.elements.interval1hBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white cursor-pointer';
      }
    }
    this.renderHourlyTimeline();
  }

  renderHourlyTimeline() {
    if (!this.elements.hourlyTimelineContainer || !this.forecastData) return;
    const selectedDate = this.forecastData.dailyItems[this.selectedDayIndex].date;
    const dayHours = this.forecastData.timeline.filter(h => h.date === selectedDate);
    const step = this.hourlyInterval;
    const filteredHours = dayHours.filter((_, idx) => idx % step === 0);

    this.elements.hourlyTimelineContainer.innerHTML = filteredHours.map(h => {
      const popBadgeColor = h.pop >= 60 ? 'text-cyan-400 font-bold' : h.pop >= 30 ? 'text-cyan-300' : 'text-slate-500';
      const precipHeight = Math.min(Math.max(h.precip * 6, h.pop > 20 ? 4 : 0), 40);

      return `
        <div class="flex-shrink-0 flex flex-col items-center justify-between p-3 rounded-xl glass-card w-24 text-center transition hover:scale-105">
          <span class="text-xs font-medium text-slate-400">${h.hour}:00</span>
          <span class="text-2xl my-2" title="${h.weatherDesc}">${h.weatherIcon}</span>
          <span class="text-base font-bold text-white mb-1">${h.temp}°</span>
          
          <div class="w-full flex flex-col items-center mt-2 pt-2 border-t border-white/5">
            <span class="text-xs ${popBadgeColor}">💧 ${h.pop}%</span>
            <div class="w-full h-8 flex items-end justify-center my-1 bg-black/20 rounded">
              <div class="w-4 bg-gradient-to-t from-cyan-600 to-blue-400 rounded-t precip-bar" style="height: ${precipHeight}px;"></div>
            </div>
            <span class="text-[10px] text-slate-400 font-mono">${h.precip > 0 ? h.precip + 'mm' : '-'}</span>
          </div>

          <div class="mt-2 text-[10px] text-slate-400">
            💨 ${h.windSpeed}km/h
          </div>
        </div>
      `;
    }).join('');
  }

  renderDailyForecast() {
    if (!this.elements.dailyCardsContainer || !this.forecastData) return;
    const days = this.forecastData.dailyItems;
    this.elements.dailyCardsContainer.innerHTML = days.map((day, idx) => {
      const isSelected = idx === this.selectedDayIndex;
      const selectClass = isSelected
        ? 'ring-2 ring-indigo-500 bg-indigo-950/60 border-indigo-400/40 shadow-lg scale-102'
        : 'glass-card hover:bg-white/10';

      const popColor = day.maxPop >= 60 ? 'text-cyan-400 font-bold' : day.maxPop >= 30 ? 'text-cyan-300' : 'text-slate-500';

      return `
        <div class="flex-shrink-0 cursor-pointer p-4 rounded-2xl flex flex-col items-center justify-between w-32 text-center transition ${selectClass}" data-day-index="${idx}">
          <div class="text-xs font-semibold ${day.isToday ? 'text-indigo-400' : 'text-slate-300'}">
            ${day.isToday ? '오늘' : `${day.date.substring(5)} (${day.dayOfWeek})`}
          </div>
          <div class="text-3xl my-2">${day.weatherIcon}</div>
          <div class="text-xs text-slate-300 mb-1 font-medium">${day.weatherDesc}</div>
          
          <div class="flex items-center gap-1.5 text-sm my-1">
            <span class="font-bold text-white">${day.maxTemp}°</span>
            <span class="text-slate-500">/</span>
            <span class="text-slate-400">${day.minTemp}°</span>
          </div>

          <div class="w-full pt-2 border-t border-white/5 flex flex-col items-center text-xs">
            <span class="${popColor}">💧 ${day.maxPop}%</span>
            <span class="text-[10px] text-slate-400">${day.precipSum > 0 ? day.precipSum + 'mm' : '비 없음'}</span>
          </div>
        </div>
      `;
    }).join('');

    this.elements.dailyCardsContainer.querySelectorAll('div[data-day-index]').forEach(card => {
      card.addEventListener('click', () => {
        this.selectedDayIndex = parseInt(card.getAttribute('data-day-index'), 10);
        this.renderDailyForecast();
        this.renderHourlyTimeline();
      });
    });
  }

  renderFavorites() {
    if (!this.elements.favList) return;
    const favs = GeoService.getFavorites();
    if (favs.length === 0) {
      this.elements.favList.innerHTML = '<span class="text-xs text-slate-500">즐겨찾기한 위치가 없습니다.</span>';
      return;
    }

    this.elements.favList.innerHTML = favs.map(f => `
      <div class="flex items-center gap-1.5 px-3 py-1 bg-white/5 hover:bg-white/10 rounded-full text-xs text-slate-300 cursor-pointer border border-white/10 transition"
           data-lat="${f.latitude}" data-lon="${f.longitude}" data-name="${f.name}" data-country="${f.country}">
        <span>📍 ${f.name}</span>
        <button class="text-slate-500 hover:text-rose-400 ml-1 text-xs" data-del-id="${f.id}">✕</button>
      </div>
    `).join('');

    this.elements.favList.querySelectorAll('div[data-lat]').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        const lat = parseFloat(item.getAttribute('data-lat'));
        const lon = parseFloat(item.getAttribute('data-lon'));
        const name = item.getAttribute('data-name');
        const country = item.getAttribute('data-country');
        this.loadWeather(lat, lon, name, country);
      });
    });

    this.elements.favList.querySelectorAll('button[data-del-id]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.getAttribute('data-del-id'), 10);
        GeoService.removeFavorite(id);
        this.renderFavorites();
        this.updateFavButtonState();
      });
    });
  }

  toggleFavorite() {
    const favs = GeoService.getFavorites();
    const existing = favs.find(f => Math.abs(f.latitude - this.currentLocation.latitude) < 0.01 && Math.abs(f.longitude - this.currentLocation.longitude) < 0.01);

    if (existing) {
      GeoService.removeFavorite(existing.id);
    } else {
      GeoService.saveFavorite(this.currentLocation);
    }
    this.renderFavorites();
    this.updateFavButtonState();
  }

  updateFavButtonState() {
    if (!this.elements.favBtn) return;
    const favs = GeoService.getFavorites();
    const isFav = favs.some(f => Math.abs(f.latitude - this.currentLocation.latitude) < 0.01 && Math.abs(f.longitude - this.currentLocation.longitude) < 0.01);
    this.elements.favBtn.textContent = isFav ? '⭐ 즐겨찾기 해제' : '☆ 즐겨찾기 추가';
    this.elements.favBtn.className = isFav
      ? 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 cursor-pointer'
      : 'px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 cursor-pointer';
  }

  // --- Gemini AI Logic ---
  openGeminiModal() {
    if (this.elements.geminiApiKeyInput) this.elements.geminiApiKeyInput.value = GeminiAI.getApiKey();
    if (this.elements.geminiModal) this.elements.geminiModal.classList.remove('hidden');
  }

  closeGeminiModal() {
    if (this.elements.geminiModal) this.elements.geminiModal.classList.add('hidden');
  }

  saveGeminiKey() {
    if (!this.elements.geminiApiKeyInput) return;
    const key = this.elements.geminiApiKeyInput.value.trim();
    GeminiAI.setApiKey(key);
    this.updateGeminiKeyStatus();
    this.closeGeminiModal();
    if (key) {
      alert('Gemini API 키가 저장되었습니다. 이제 AI 정밀 기상 분석 및 Q&A를 사용할 수 있습니다!');
    }
  }

  updateGeminiKeyStatus() {
    if (!this.elements.geminiKeyStatus) return;
    const hasKey = GeminiAI.hasApiKey();
    if (hasKey) {
      this.elements.geminiKeyStatus.textContent = '🔑 Gemini AI 연동됨';
      this.elements.geminiKeyStatus.className = 'text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/30';
    } else {
      this.elements.geminiKeyStatus.textContent = '⚙️ Gemini API 설정';
      this.elements.geminiKeyStatus.className = 'text-xs text-indigo-300 bg-indigo-500/20 px-2.5 py-1 rounded-full border border-indigo-500/30';
    }
  }

  async triggerGeminiBriefing() {
    if (!GeminiAI.hasApiKey()) {
      this.openGeminiModal();
      return;
    }

    if (!this.forecastData) return;

    try {
      if (this.elements.geminiBriefingContent) {
        this.elements.geminiBriefingContent.innerHTML = `
          <div class="flex items-center gap-3 py-6 justify-center text-indigo-300">
            <div class="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
            <span class="text-sm">Gemini AI가 실시간 기상 데이터를 정밀 분석 중입니다...</span>
          </div>
        `;
      }
      if (this.elements.geminiBriefingCard) this.elements.geminiBriefingCard.classList.remove('hidden');

      const markdown = await GeminiAI.getAiWeatherAnalysis(this.forecastData, this.currentLocation.name);
      
      const formatted = markdown
        .replace(/^### (.*$)/gim, '<h4 class="font-bold text-indigo-300 mt-3 mb-1 text-sm">$1</h4>')
        .replace(/^## (.*$)/gim, '<h3 class="font-bold text-white mt-4 mb-2 text-base">$1</h3>')
        .replace(/^\* (.*$)/gim, '<li class="ml-4 list-disc text-slate-200 text-sm mb-1">$1</li>')
        .replace(/\*\*(.*?)\*\*/gim, '<strong class="text-indigo-200 font-semibold">$1</strong>')
        .replace(/\n\n/g, '<div class="h-2"></div>')
        .replace(/\n/g, '<br>');

      if (this.elements.geminiBriefingContent) this.elements.geminiBriefingContent.innerHTML = formatted;
    } catch (err) {
      if (this.elements.geminiBriefingContent) {
        this.elements.geminiBriefingContent.innerHTML = `
          <div class="p-3 bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-xl text-sm">
            ⚠️ AI 분석 오류: ${err.message}
          </div>
        `;
      }
    }
  }

  async sendGeminiChat() {
    if (!this.elements.geminiChatInput || !this.elements.geminiChatMessages) return;
    const question = this.elements.geminiChatInput.value.trim();
    if (!question) return;

    if (!GeminiAI.hasApiKey()) {
      this.openGeminiModal();
      return;
    }

    this.elements.geminiChatInput.value = '';

    const userMsg = document.createElement('div');
    userMsg.className = 'flex justify-end mb-3';
    userMsg.innerHTML = `
      <div class="bg-indigo-600 text-white rounded-2xl rounded-tr-none px-4 py-2 text-sm max-w-[85%] shadow">
        ${question}
      </div>
    `;
    this.elements.geminiChatMessages.appendChild(userMsg);
    this.elements.geminiChatMessages.scrollTop = this.elements.geminiChatMessages.scrollHeight;

    const botLoading = document.createElement('div');
    botLoading.className = 'flex justify-start mb-3';
    botLoading.innerHTML = `
      <div class="bg-slate-800 border border-white/10 text-slate-300 rounded-2xl rounded-tl-none px-4 py-2 text-sm max-w-[85%] flex items-center gap-2">
        <div class="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
        <span>답변 분석 중...</span>
      </div>
    `;
    this.elements.geminiChatMessages.appendChild(botLoading);
    this.elements.geminiChatMessages.scrollTop = this.elements.geminiChatMessages.scrollHeight;

    try {
      const reply = await GeminiAI.askQuestion(question, this.forecastData, this.currentLocation.name);
      botLoading.innerHTML = `
        <div class="bg-slate-800/90 border border-white/10 text-slate-200 rounded-2xl rounded-tl-none px-4 py-2.5 text-sm max-w-[90%] shadow-lg leading-relaxed whitespace-pre-line">
          ${reply.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}
        </div>
      `;
    } catch (err) {
      botLoading.innerHTML = `
        <div class="bg-rose-950/60 border border-rose-500/30 text-rose-300 rounded-2xl rounded-tl-none px-4 py-2 text-sm">
          ⚠️ 오류: ${err.message}
        </div>
      `;
    }
    this.elements.geminiChatMessages.scrollTop = this.elements.geminiChatMessages.scrollHeight;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new WeatherApp();
  app.init();
});
