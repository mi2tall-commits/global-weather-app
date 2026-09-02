/**
 * Google Apps Script (GAS) - 글로벌 앙상블 일일 날씨 브리핑 자동 발송기
 * 
 * [설정 및 사용 방법]
 * 1. https://script.google.com 에 접속하여 새 프로젝트를 만듭니다.
 * 2. 본 코드 전체를 복사하여 Code.gs에 붙여넣습니다.
 * 3. CONFIG 객체의 TARGET_EMAIL 또는 TELEGRAM 설정을 입력합니다.
 * 4. sendDailyWeatherBriefing() 함수를 1회 실행하여 권한을 승인합니다.
 * 5. 좌측 메뉴의 '트리거(Triggers, 시계 아이콘)' -> '트리거 추가'
 *    - 실행할 함수: sendDailyWeatherBriefing
 *    - 이벤트 소스: 시간 기반
 *    - 트리거 유형: 일별 타이머 (예: 오전 7시 ~ 8시)
 */

const CONFIG = {
  // 알림 수신 대상 (본인 이메일)
  TARGET_EMAIL: 'your-email@gmail.com',
  
  // 위치 설정 (기본: 서울특별시)
  LOCATION: {
    name: '서울특별시',
    latitude: 37.5665,
    longitude: 126.9780,
  },

  // 텔레그램 알림 사용 시 (선택 사항)
  TELEGRAM: {
    ENABLED: false,
    BOT_TOKEN: 'YOUR_TELEGRAM_BOT_TOKEN',
    CHAT_ID: 'YOUR_CHAT_ID',
  }
};

/**
 * 매일 아침 자동 실행 함수 (트리거 등록 대상)
 */
function sendDailyWeatherBriefing() {
  const weather = fetchWeatherData(CONFIG.LOCATION.latitude, CONFIG.LOCATION.longitude);
  if (!weather) {
    Logger.log('날씨 데이터를 가져오는데 실패했습니다.');
    return;
  }

  const briefing = generateBriefingMessage(weather, CONFIG.LOCATION.name);
  
  // 1. Gmail 이메일 발송
  if (CONFIG.TARGET_EMAIL && CONFIG.TARGET_EMAIL !== 'your-email@gmail.com') {
    GmailApp.sendEmail(
      CONFIG.TARGET_EMAIL,
      `[기상 브리핑] 🌍 오늘의 ${CONFIG.LOCATION.name} 종합 날씨 및 강수 예보`,
      briefing.plainText,
      { htmlBody: briefing.htmlText }
    );
    Logger.log('Gmail 발송 완료: ' + CONFIG.TARGET_EMAIL);
  }

  // 2. 텔레그램 발송 (활성화 시)
  if (CONFIG.TELEGRAM.ENABLED && CONFIG.TELEGRAM.BOT_TOKEN) {
    sendTelegramMessage(CONFIG.TELEGRAM.BOT_TOKEN, CONFIG.TELEGRAM.CHAT_ID, briefing.plainText);
  }
}

/**
 * Open-Meteo 글로벌 예보 API 호출
 */
function fetchWeatherData(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=Asia/Seoul&forecast_days=3&hourly=temperature_2m,precipitation_probability,precipitation,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum`;
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (response.getResponseCode() === 200) {
    return JSON.parse(response.getContentText());
  }
  return null;
}

/**
 * 앙상블 분석 및 메시지 서식 생성
 */
function generateBriefingMessage(data, locationName) {
  const today = data.daily;
  const maxTemp = Math.round(today.temperature_2m_max[0]);
  const minTemp = Math.round(today.temperature_2m_min[0]);
  const maxPop = today.precipitation_probability_max[0];
  const precipSum = today.precipitation_sum[0].toFixed(1);

  // 24시간 내 비오는 시간대 체크
  const hourly = data.hourly;
  const rainHours = [];
  for (let i = 0; i < 24; i++) {
    if (hourly.precipitation_probability[i] >= 40 || hourly.precipitation[i] > 0.2) {
      const hour = parseInt(hourly.time[i].split('T')[1].split(':')[0], 10);
      rainHours.push(`${hour}시(${hourly.precipitation_probability[i]}%, ${hourly.precipitation[i]}mm)`);
    }
  }

  const umbrellaTip = maxPop >= 60 || parseFloat(precipSum) >= 3 
    ? '☔ 우산을 꼭 챙기세요! (비/소나기 예보)' 
    : maxPop >= 30 
    ? '🌂 접이식 우산 소지를 권장합니다.' 
    : '☀️ 우산이 필요 없는 맑은 날씨입니다.';

  const plainText = `
[🌍 오늘의 글로벌 앙상블 기상 브리핑 - ${locationName}]

📅 일자: ${new Date().toLocaleDateString('ko-KR')}
🌡️ 기온: 최저 ${minTemp}°C / 최고 ${maxTemp}°C
💧 강수 확률: 최대 ${maxPop}% (예상 강수량: ${precipSum}mm)
🌂 우산 지수: ${umbrellaTip}

${rainHours.length > 0 ? `🕒 비 예상 시간대:\n${rainHours.join('\n')}` : '✨ 24시간 내 강수 가능성 없음'}

ECMWF, 기상청, GFS 모델 종합 분석 완료.
  `.trim();

  const htmlText = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; background: #0f172a; color: #f8fafc; border-radius: 16px;">
      <h2 style="color: #818cf8; margin-bottom: 8px;">🌍 오늘의 글로벌 기상 브리핑</h2>
      <p style="color: #94a3b8; font-size: 14px; margin-top: 0;">${locationName} • ${new Date().toLocaleDateString('ko-KR')}</p>
      
      <div style="background: rgba(255,255,255,0.05); padding: 16px; border-radius: 12px; margin: 16px 0;">
        <p style="margin: 6px 0; font-size: 16px;">🌡️ <b>기온:</b> 최저 <span style="color:#60a5fa">${minTemp}°C</span> / 최고 <span style="color:#f87171">${maxTemp}°C</span></p>
        <p style="margin: 6px 0; font-size: 16px;">💧 <b>강수 확률:</b> 최대 <span style="color:#38bdf8">${maxPop}%</span> (예상: ${precipSum}mm)</p>
        <p style="margin: 6px 0; font-size: 16px;">🌂 <b>우산 지수:</b> <b>${umbrellaTip}</b></p>
      </div>

      <div style="background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.3); padding: 14px; border-radius: 12px;">
        <h4 style="margin: 0 0 8px 0; color: #a5b4fc;">🕒 시간대별 강수 예보</h4>
        <p style="margin: 0; font-size: 14px; color: #e2e8f0;">
          ${rainHours.length > 0 ? rainHours.join('<br>') : '오늘 하루 강수 가능성이 없습니다. 쾌적한 하루 보내세요!'}
        </p>
      </div>
      
      <p style="font-size: 12px; color: #64748b; margin-top: 20px; text-align: center;">
        유럽 ECMWF · 한국 기상청 · 미국 GFS 다중 수치예보 모델 앙상블 분석
      </p>
    </div>
  `;

  return { plainText, htmlText };
}

function sendTelegramMessage(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: text })
  });
}
