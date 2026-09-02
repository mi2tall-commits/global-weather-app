/**
 * Gemini AI Weather Consulting Service
 * Connects with Google Gemini API for intelligent weather briefings and interactive Q&A.
 */

export const GeminiAI = {
  STORAGE_KEY: 'gemini_weather_api_key',

  getApiKey() {
    return localStorage.getItem(this.STORAGE_KEY) || '';
  },

  setApiKey(key) {
    if (!key) {
      localStorage.removeItem(this.STORAGE_KEY);
    } else {
      localStorage.setItem(this.STORAGE_KEY, key.trim());
    }
  },

  hasApiKey() {
    return Boolean(this.getApiKey());
  },

  /**
   * Call Gemini API
   */
  async generateContent(prompt, systemInstruction = '') {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('Gemini API 키가 등록되지 않았습니다. 상단 [Gemini AI 설정] 버튼을 눌러 API 키를 입력해 주세요.');
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const body = {
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ]
    };

    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Gemini API 호출 실패 (${res.status})`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    if (!candidate || !candidate.content?.parts?.[0]?.text) {
      throw new Error('AI 응답을 생성하지 못했습니다.');
    }

    return candidate.content.parts[0].text;
  },

  /**
   * Generate Expert AI Weather Briefing
   */
  async getAiWeatherAnalysis(forecastData, locationName) {
    const cur = forecastData.current;
    const next24h = forecastData.timeline.slice(0, 24);
    const daily = forecastData.dailyItems.slice(0, 7);

    const weatherContext = JSON.stringify({
      location: locationName,
      current: {
        temperature: cur.temp,
        apparentTemperature: cur.apparentTemp,
        weather: cur.weatherDesc,
        humidity: cur.humidity,
        windSpeed: cur.windSpeed,
        precipitation: cur.precip
      },
      next24HoursHourly: next24h.map(h => ({
        hour: `${h.hour}시`,
        temp: `${h.temp}°C`,
        rainProb: `${h.pop}%`,
        precipAmount: `${h.precip}mm`,
        weather: h.weatherDesc
      })),
      upcomingWeekDaily: daily.map(d => ({
        date: d.date,
        dayOfWeek: d.dayOfWeek,
        maxTemp: `${d.maxTemp}°C`,
        minTemp: `${d.minTemp}°C`,
        rainProbMax: `${d.maxPop}%`,
        precipSum: `${d.precipSum}mm`,
        weather: d.weatherDesc
      }))
    });

    const prompt = `
당신은 최고 수준의 글로벌 기상 분석관이자 라이프스타일 날씨 컨설턴트입니다.
아래 제공된 [${locationName}]의 실시간 앙상블 수치예보 데이터를 분석하여 사용자에게 매우 유용하고 친절한 맞춤형 AI 날씨 리포트를 작성해 주세요.

[수치예보 데이터]:
${weatherContext}

[작성 가이드라인]:
1. **오늘의 핵심 요약 및 앙상블 총평**: 비가 오는지, 언제 오는지, 기온 변화의 핵심을 명쾌하게 요약
2. **시간대별 외출/활동 팁**: 출퇴근/외출 시 우산 필요 시간대, 최적 옷차림(레이어드 등)
3. **생활 지수 맞춤 조언**: 세차, 빨래, 야외 운동/러닝하기 가장 좋은 시간대 추천
4. **주간 날씨 포인트**: 이번 주말 또는 며칠 뒤 날씨 변화의 핵심

가독성 좋게 이모지와 불릿 포인트를 활용하여 마크다운 형식으로 작성해 주세요.
    `.trim();

    return await this.generateContent(prompt);
  },

  /**
   * Interactive Q&A with Weather context
   */
  async askQuestion(question, forecastData, locationName) {
    const cur = forecastData.current;
    const next48h = forecastData.timeline.slice(0, 48);
    const daily = forecastData.dailyItems.slice(0, 14);

    const context = `
[현재 위치]: ${locationName}
[현재 상태]: ${cur.temp}°C, 체감 ${cur.apparentTemp}°C, ${cur.weatherDesc}, 습도 ${cur.humidity}%, 풍속 ${cur.windSpeed}km/h
[향후 48시간 시간대별 데이터]:
${JSON.stringify(next48h.map(h => ({ time: h.time, temp: h.temp, pop: h.pop + '%', rain: h.precip + 'mm', desc: h.weatherDesc })))}
[14일간 일별 요약]:
${JSON.stringify(daily.map(d => ({ date: d.date, day: d.dayOfWeek, minMax: `${d.minTemp}~${d.maxTemp}°C`, maxPop: d.maxPop + '%', rain: d.precipSum + 'mm', desc: d.weatherDesc })))}
    `;

    const systemInstruction = `
당신은 기상 데이터 기반 전문 AI 어시스턴트입니다. 사용자의 질문에 대해 제공된 정밀 기상 예측 데이터를 근거로 명확하고 신뢰할 수 있는 답변을 제공하세요.
질문 예시: 세차 타이밍, 빨래 건조, 야외 캠핑/러닝 적합 시간, 여행 일정 옷차림 등.
    `;

    const prompt = `
[기상 데이터 컨텍스트]:
${context}

[사용자 질문]:
${question}

위 데이터를 바탕으로 질문에 대해 친절하고 구체적인 시간대/날짜를 언급하며 실질적인 조언을 해주세요.
    `.trim();

    return await this.generateContent(prompt, systemInstruction);
  }
};
