import { WeatherAPI } from './api.js';
import { EnsembleEngine } from './ensemble.js';
import { GeoService } from './geo.js';
import { GeminiAI } from './ai.js';

class WeatherApp {
  constructor() {
    this.currentLocation = GeoService.DEFAULT_LOCATION;
    this.forecastData = null;
    this.airQualityData = null;
    this.hourlyInterval = 3; // default 3-hour interval for comfortable readability
    this.expandedDate = null; // Currently expanded day's date string
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

      // Current Weather
      currentTemp: document.getElementById('currentTemp'),
      currentDesc: document.getElementById('currentDesc'),
      currentIcon: document.getElementById('currentIcon'),
      currentApparent: document.getElementById('currentApparent'),
      currentHumidity: document.getElementById('currentHumidity'),
      currentWind: document.getElementById('currentWind'),
      pm10Badge: document.getElementById('pm10Badge'),
      pm25Badge: document.getElementById('pm25Badge'),
      todayHighLow: document.getElementById('todayHighLow'),
      updateTime: document.getElementById('updateTime'),

      // Consensus & Alerts
      consensusCard: document.getElementById('consensusCard'),
      consensusText: document.getElementById('consensusText'),
      consensusBadge: document.getElementById('consensusBadge'),
      severeAlertBanner: document.getElementById('severeAlertBanner'),

      // Hourly Interval Buttons
      interval1hBtn: document.getElementById('interval1hBtn'),
      interval3hBtn: document.getElementById('interval3hBtn'),

      // Vertical Weekly Accordion List
      verticalWeeklyList: document.getElementById('verticalWeeklyList'),

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
        .then(() => console.log('Service Worker 등록 완료'))
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

    // 1. Instant Location
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
      console.warn('GPS 오류:', err);
    } finally {
      this.showLoading(false);
    }
  }

  async handleSearch(query) {
    const results = await WeatherAPI.searchLocation(query);
    if (!this.elements.searchResults) return;

    if (!results || results.length === 0) {
      this.elements.searchResults.innerHTML = `
        <div class="p-3 text-xs text-slate-400 text-center">검색 결과가 없습니다.</div>
      `;
      this.elements.searchResults.classList.remove('hidden');
      return;
    }

    this.elements.searchResults.innerHTML = results.map(r => `
      <div class="p-2.5 hover:bg-white/10 cursor-pointer border-b border-white/5 last:border-0 flex items-center justify-between text-left transition"
           data-lat="${r.latitude}" data-lon="${r.longitude}" data-name="${r.name}" data-sub="${r.subText}" data-country="${r.country || ''}">
        <div class="truncate mr-2">
          <div class="font-medium text-white text-xs sm:text-sm truncate">${r.name}</div>
          <div class="text-[11px] text-slate-400 truncate">${r.subText}</div>
        </div>
        <span class="text-[11px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded flex-shrink-0">선택</span>
      </div>
    `).join('');

    this.elements.searchResults.querySelectorAll('div[data-lat]').forEach(item => {
      item.addEventListener('click', () => {
        const lat = parseFloat(item.getAttribute('data-lat'));
        const lon = parseFloat(item.getAttribute('data-lon'));
        const name = item.getAttribute('data-name');
        const sub = item.getAttribute('data-sub');
        const country = item.getAttribute('data-country');

        if (this.elements.searchInput) this.elements.searchInput.value = '';
        this.elements.searchResults.classList.add('hidden');
        
        const loc = { name, country: sub || country, latitude: lat, longitude: lon };
        localStorage.setItem('last_user_location', JSON.stringify(loc));
        this.loadWeather(lat, lon, name, sub || country);
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

      // Default expand today's date
      if (this.forecastData.dailyItems?.length > 0) {
        this.expandedDate = this.forecastData.dailyItems[0].date;
      }

      if (this.elements.offlineNotice) {
        if (this.forecastData._isCached) {
          const cachedTimeStr = this.forecastData._cachedAt ? new Date(this.forecastData._cachedAt).toLocaleTimeString('ko-KR') : '';
          this.elements.offlineNotice.innerHTML = `📡 <b>오프라인 모드:</b> 최근 저장된 예보(${cachedTimeStr})를 표시하고 있습니다.`;
          this.elements.offlineNotice.classList.remove('hidden');
        } else {
          this.elements.offlineNotice.classList.add('hidden');
        }
      }

      this.renderAll();
    } catch (err) {
      console.error('날씨 로드 실패:', err);
    } finally {
      this.showLoading(false);
    }
  }

  renderAll() {
    this.renderCurrentWeather();
    this.renderConsensusAndAlerts();
    this.renderVerticalWeeklyList();
    this.updateFavButtonState();
  }

  renderCurrentWeather() {
    if (!this.forecastData?.current) return;
    const cur = this.forecastData.current;
    const today = this.forecastData.dailyItems?.[0];

    if (this.elements.currentTemp) this.elements.currentTemp.textContent = `${cur.temp}°`;
    if (this.elements.currentDesc) this.elements.currentDesc.textContent = cur.weatherDesc;
    if (this.elements.currentIcon) this.elements.currentIcon.textContent = cur.weatherIcon;
    if (this.elements.currentApparent) this.elements.currentApparent.textContent = `체감 ${cur.apparentTemp}°C`;
    if (this.elements.currentHumidity) this.elements.currentHumidity.textContent = `${cur.humidity}%`;
    if (this.elements.currentWind) this.elements.currentWind.textContent = `${cur.windSpeed}km/h`;

    if (this.elements.todayHighLow && today) {
      this.elements.todayHighLow.textContent = `최고 ${today.maxTemp}° / 최저 ${today.minTemp}°`;
    }

    if (this.airQualityData?.current) {
      const pm10 = Math.round(this.airQualityData.current.pm10 || 0);
      const pm25 = Math.round(this.airQualityData.current.pm2_5 || 0);

      if (this.elements.pm10Badge) {
        let pm10Text = '좋음 🟢';
        let pm10Color = 'text-emerald-400';
        if (pm10 > 150) { pm10Text = '매우나쁨 🔴'; pm10Color = 'text-rose-400'; }
        else if (pm10 > 80) { pm10Text = '나쁨 🟡'; pm10Color = 'text-amber-400'; }
        else if (pm10 > 30) { pm10Text = '보통 🔵'; pm10Color = 'text-blue-400'; }
        this.elements.pm10Badge.textContent = `${pm10Text} (${pm10})`;
        this.elements.pm10Badge.className = `font-bold ${pm10Color}`;
      }

      if (this.elements.pm25Badge) {
        let pm25Text = '좋음 🟢';
        let pm25Color = 'text-emerald-400';
        if (pm25 > 75) { pm25Text = '매우나쁨 🔴'; pm25Color = 'text-rose-400'; }
        else if (pm25 > 35) { pm25Text = '나쁨 🟡'; pm25Color = 'text-amber-400'; }
        else if (pm25 > 15) { pm25Text = '보통 🔵'; pm25Color = 'text-blue-400'; }
        this.elements.pm25Badge.textContent = `${pm25Text} (${pm25})`;
        this.elements.pm25Badge.className = `font-bold ${pm25Color}`;
      }
    }

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
      this.elements.consensusBadge.className = `text-[10px] px-2 py-0.5 rounded-full font-semibold border ${insight.agreementBadge}`;
      this.elements.consensusBadge.textContent = `일치도: ${insight.agreementLevel}`;
    }

    const next24 = this.forecastData.timeline.slice(0, 24);
    const maxWind = Math.max(...next24.map(h => h.windSpeed));
    const maxPrecip = Math.max(...next24.map(h => h.precip));
    const maxTemp = Math.max(...next24.map(h => h.temp));
    const minTemp = Math.min(...next24.map(h => h.temp));

    const alerts = [];
    if (maxPrecip >= 20 || insight.totalPrecip24h >= 40) {
      alerts.push('⚠️ [호우 주의보] 24시간 내 강한 집중 호우가 예상됩니다. 안전에 유의하세요.');
    } else if (maxWind >= 50) {
      alerts.push('💨 [강풍 주의보] 순간 최대 풍속 50km/h 이상의 강한 바람에 주의하세요.');
    } else if (maxTemp >= 33) {
      alerts.push('🔥 [폭염 주의] 낮 최고기온 33°C 이상의 무더위에 유의하세요.');
    } else if (minTemp <= -10) {
      alerts.push('❄️ [한파 주의] 영하 10°C 이하의 강추위 및 동파 예방에 유의하세요.');
    }

    if (this.elements.severeAlertBanner) {
      if (alerts.length > 0) {
        this.elements.severeAlertBanner.innerHTML = alerts.map(a => `<div class="p-3 bg-amber-500/20 border border-amber-500/40 text-amber-200 rounded-2xl text-xs font-medium">${a}</div>`).join('');
        this.elements.severeAlertBanner.classList.remove('hidden');
      } else {
        this.elements.severeAlertBanner.classList.add('hidden');
        this.elements.severeAlertBanner.innerHTML = '';
      }
    }
  }

  setInterval(interval) {
    this.hourlyInterval = interval;
    if (this.elements.interval1hBtn && this.elements.interval3hBtn) {
      if (interval === 1) {
        this.elements.interval1hBtn.className = 'px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-600 text-white shadow cursor-pointer';
        this.elements.interval3hBtn.className = 'px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-400 hover:text-white cursor-pointer';
      } else {
        this.elements.interval3hBtn.className = 'px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-600 text-white shadow cursor-pointer';
        this.elements.interval1hBtn.className = 'px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-400 hover:text-white cursor-pointer';
      }
    }
    this.renderVerticalWeeklyList();
  }

  /**
   * 세로형 주간 예보 및 클릭 시 시간대별 아코디언 펼침 렌더러
   */
  renderVerticalWeeklyList() {
    if (!this.elements.verticalWeeklyList || !this.forecastData) return;
    const days = this.forecastData.dailyItems;

    const allMin = Math.min(...days.map(d => d.minTemp));
    const allMax = Math.max(...days.map(d => d.maxTemp));
    const tempRange = Math.max(allMax - allMin, 1);

    this.elements.verticalWeeklyList.innerHTML = days.map((day, idx) => {
      const isExpanded = this.expandedDate === day.date;
      let dayLabel = `${day.date.substring(5)} (${day.dayOfWeek})`;
      let dayClass = 'text-slate-200';
      if (idx === 0) { dayLabel = '오늘'; dayClass = 'text-indigo-400 font-bold'; }
      else if (idx === 1) { dayLabel = '내일'; dayClass = 'text-white font-medium'; }
      else if (idx === 2) { dayLabel = '모레'; dayClass = 'text-white font-medium'; }

      const popColor = day.maxPop >= 60 ? 'text-cyan-400 font-bold' : day.maxPop >= 30 ? 'text-cyan-300' : 'text-slate-500';

      const leftPercent = ((day.minTemp - allMin) / tempRange) * 100;
      const widthPercent = Math.max(((day.maxTemp - day.minTemp) / tempRange) * 100, 10);

      // Hourly timeline for this specific day
      let hourlyContent = '';
      if (isExpanded) {
        const dayHours = this.forecastData.timeline.filter(h => h.date === day.date);
        const step = this.hourlyInterval;
        const filtered = dayHours.filter((_, i) => i % step === 0);

        hourlyContent = `
          <div class="mt-2.5 mb-1 p-3 rounded-2xl bg-slate-950/80 border border-white/5 space-y-2.5 animate-fadeIn">
            <div class="flex items-center justify-between text-[11px] text-indigo-300 font-semibold px-1">
              <span>🕒 ${dayLabel} 시간대별 상세 (${this.hourlyInterval}시간 간격)</span>
              <span class="text-slate-400 font-normal">강수량: ${day.precipSum > 0 ? day.precipSum + 'mm' : '없음'}</span>
            </div>

            <!-- Horizontal / Grid Timeline inside expanded day -->
            <div class="grid grid-cols-4 sm:grid-cols-8 gap-1.5 pt-1">
              ${filtered.map(h => {
                const hPopColor = h.pop >= 60 ? 'text-cyan-400 font-bold' : h.pop >= 30 ? 'text-cyan-300' : 'text-slate-500';
                return `
                  <div class="p-2 rounded-xl weather-subcard flex flex-col items-center justify-between text-center">
                    <span class="text-[10px] text-slate-400 font-medium">${h.hour}시</span>
                    <span class="text-xl my-1" title="${h.weatherDesc}">${h.weatherIcon}</span>
                    <span class="text-xs font-bold text-white">${h.temp}°</span>
                    <span class="text-[9px] ${hPopColor} mt-1">💧${h.pop}%</span>
                    <span class="text-[8px] text-slate-400 font-mono">${h.precip > 0 ? h.precip + 'm' : '-'}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }

      return `
        <div class="py-2.5 cursor-pointer rounded-2xl transition hover:bg-white/5" data-date="${day.date}">
          <!-- Day Summary Row -->
          <div class="flex items-center justify-between gap-2 px-2 text-xs">
            <!-- 1. Day of week & date -->
            <div class="w-20 text-left flex items-center gap-1.5">
              <span class="text-[10px] text-slate-500 transition-transform ${isExpanded ? 'rotate-90 text-indigo-400' : ''}">▶</span>
              <div>
                <div class="${dayClass}">${dayLabel}</div>
                <div class="text-[10px] text-slate-400">${day.date.substring(5)}</div>
              </div>
            </div>

            <!-- 2. Weather Icon + Rain Prob -->
            <div class="flex items-center gap-2 w-24 sm:w-28 justify-start">
              <span class="text-2xl">${day.weatherIcon}</span>
              <div>
                <div class="text-[11px] text-slate-200 truncate font-medium">${day.weatherDesc}</div>
                <div class="text-[10px] ${popColor}">💧 ${day.maxPop}%</div>
              </div>
            </div>

            <!-- 3. Min Temp -> Range Bar -> Max Temp -->
            <div class="flex-1 flex items-center justify-end gap-2 max-w-[140px] sm:max-w-[160px]">
              <span class="text-slate-400 font-medium w-6 text-right">${day.minTemp}°</span>
              <div class="flex-1 temp-bar-bg h-1.5 relative overflow-hidden">
                <div class="temp-bar-fill" style="left: ${leftPercent}%; width: ${widthPercent}%;"></div>
              </div>
              <span class="text-white font-bold w-6 text-left">${day.maxTemp}°</span>
            </div>
          </div>

          <!-- Expanded Accordion Content -->
          ${hourlyContent}
        </div>
      `;
    }).join('');

    // Attach click listeners to accordion rows
    this.elements.verticalWeeklyList.querySelectorAll('div[data-date]').forEach(row => {
      row.addEventListener('click', (e) => {
        // Prevent click when selecting text
        const targetDate = row.getAttribute('data-date');
        if (this.expandedDate === targetDate) {
          this.expandedDate = null; // collapse
        } else {
          this.expandedDate = targetDate; // expand
        }
        this.renderVerticalWeeklyList();
      });
    });
  }

  renderFavorites() {
    if (!this.elements.favList) return;
    const favs = GeoService.getFavorites();
    if (favs.length === 0) {
      this.elements.favList.innerHTML = '<span class="text-[11px] text-slate-500">즐겨찾기한 위치가 없습니다.</span>';
      return;
    }

    this.elements.favList.innerHTML = favs.map(f => `
      <div class="flex items-center gap-1 px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded-full text-xs text-slate-300 cursor-pointer border border-white/10 transition flex-shrink-0"
           data-lat="${f.latitude}" data-lon="${f.longitude}" data-name="${f.name}" data-country="${f.country}">
        <span>📍 ${f.name}</span>
        <button class="text-slate-500 hover:text-rose-400 ml-0.5 text-xs" data-del-id="${f.id}">✕</button>
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
    this.elements.favBtn.textContent = isFav ? '⭐ 즐겨찾기 해제' : '☆ 즐겨찾기';
    this.elements.favBtn.className = isFav
      ? 'px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 cursor-pointer'
      : 'px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 cursor-pointer';
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
      alert('Gemini API 키가 저장되었습니다!');
    }
  }

  updateGeminiKeyStatus() {
    if (!this.elements.geminiKeyStatus) return;
    const hasKey = GeminiAI.hasApiKey();
    if (hasKey) {
      this.elements.geminiKeyStatus.textContent = '✨ AI 활성';
      this.elements.geminiKeyStatus.className = 'text-[11px] text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-lg border border-emerald-500/30';
    } else {
      this.elements.geminiKeyStatus.textContent = '✨ AI 설정';
      this.elements.geminiKeyStatus.className = 'text-[11px] text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded-lg border border-indigo-500/30';
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
          <div class="flex items-center gap-2 py-4 justify-center text-indigo-300 text-xs">
            <div class="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
            <span>Gemini AI가 정밀 분석 중입니다...</span>
          </div>
        `;
      }
      if (this.elements.geminiBriefingCard) this.elements.geminiBriefingCard.classList.remove('hidden');

      const markdown = await GeminiAI.getAiWeatherAnalysis(this.forecastData, this.currentLocation.name);
      
      const formatted = markdown
        .replace(/^### (.*$)/gim, '<h4 class="font-bold text-indigo-300 mt-2 mb-1 text-xs">$1</h4>')
        .replace(/^## (.*$)/gim, '<h3 class="font-bold text-white mt-3 mb-1.5 text-sm">$1</h3>')
        .replace(/^\* (.*$)/gim, '<li class="ml-3 list-disc text-slate-200 text-xs mb-0.5">$1</li>')
        .replace(/\*\*(.*?)\*\*/gim, '<strong class="text-indigo-200 font-semibold">$1</strong>')
        .replace(/\n\n/g, '<div class="h-1.5"></div>')
        .replace(/\n/g, '<br>');

      if (this.elements.geminiBriefingContent) this.elements.geminiBriefingContent.innerHTML = formatted;
    } catch (err) {
      if (this.elements.geminiBriefingContent) {
        this.elements.geminiBriefingContent.innerHTML = `
          <div class="p-2.5 bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-xl text-xs">
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
    userMsg.className = 'flex justify-end mb-2';
    userMsg.innerHTML = `
      <div class="bg-indigo-600 text-white rounded-xl rounded-tr-none px-3 py-1.5 text-xs max-w-[85%] shadow">
        ${question}
      </div>
    `;
    this.elements.geminiChatMessages.appendChild(userMsg);
    this.elements.geminiChatMessages.scrollTop = this.elements.geminiChatMessages.scrollHeight;

    const botLoading = document.createElement('div');
    botLoading.className = 'flex justify-start mb-2';
    botLoading.innerHTML = `
      <div class="bg-slate-800 border border-white/10 text-slate-300 rounded-xl rounded-tl-none px-3 py-1.5 text-xs max-w-[85%] flex items-center gap-2">
        <div class="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
        <span>답변 분석 중...</span>
      </div>
    `;
    this.elements.geminiChatMessages.appendChild(botLoading);
    this.elements.geminiChatMessages.scrollTop = this.elements.geminiChatMessages.scrollHeight;

    try {
      const reply = await GeminiAI.askQuestion(question, this.forecastData, this.currentLocation.name);
      botLoading.innerHTML = `
        <div class="bg-slate-800/90 border border-white/10 text-slate-200 rounded-xl rounded-tl-none px-3 py-2 text-xs max-w-[90%] shadow-lg leading-relaxed whitespace-pre-line">
          ${reply.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}
        </div>
      `;
    } catch (err) {
      botLoading.innerHTML = `
        <div class="bg-rose-950/60 border border-rose-500/30 text-rose-300 rounded-xl text-xs">
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
