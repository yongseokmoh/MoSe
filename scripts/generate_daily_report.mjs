import fs from 'fs';
import path from 'path';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const profilePath = path.join(process.cwd(), 'src', 'data', 'user_profile.json');
const userProfile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

const MAJOR_STOCKS = userProfile.stocks.filter(s => s.type === 'major');
const INTEREST_STOCKS = userProfile.stocks.filter(s => s.type === 'interest');
const ARCHIVED_STOCKS = userProfile.stocks.filter(s => s.type === 'archived');

async function fetchGoogleNews(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
  const response = await fetch(url);
  const text = await response.text();
  const items = [];
  const itemRegex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<\/item>/g;
  let match;
  while ((match = itemRegex.exec(text)) !== null && items.length < 10) { // 최대 10개까지 확보
    items.push({ 
      title: match[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/&quot;/g, '"'), 
      link: match[2] 
    });
  }
  return items;
}

async function callGemini(prompt, isJson = false) {
  if (!GEMINI_API_KEY) return isJson ? { summary: "API 키 누락", topNewsIndex: [0, 1] } : "API 키 누락으로 인한 더미 데이터입니다.";
  
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        ...(isJson && { generationConfig: { responseMimeType: "application/json" } })
      })
    });
    const data = await res.json();
    const text = data.candidates[0].content.parts[0].text;
    return isJson ? JSON.parse(text) : text;
  } catch (e) {
    console.error(e);
    return isJson ? { summary: "요약 오류", topNewsIndex: [0] } : "요약 오류 발생";
  }
}

// 개별 종목 요약
async function summarizeStock(stockName, newsItems, maxNewsCount) {
  if (newsItems.length === 0) return { summary: "최신 뉴스가 없습니다.", news: [] };
  
  const prompt = `
  다음은 '${stockName}'에 대한 최신 뉴스 헤드라인들이야.
  [특별 지시사항]: 애널리스트 리포트(목표가), 실적 발표, 전일/장외 거래 변동 내용이 있다면 무조건 우선적으로 포함해서 요약해.
  뉴스 목록:
  ${newsItems.map((n, i) => `${i}. ${n.title}`).join('\n')}
  
  출력 형식 (반드시 JSON):
  {
    "summary": "3문장 요약",
    "topNewsIndex": [가장 중요한 뉴스 인덱스 번호 배열 (최대 ${maxNewsCount}개)]
  }
  `;
  const result = await callGemini(prompt, true);
  const selectedNews = (result.topNewsIndex || []).slice(0, maxNewsCount).map(idx => newsItems[idx]).filter(Boolean);
  return { summary: result.summary, news: selectedNews };
}

// Yahoo Finance API를 활용한 실시간 지수 수집 (별도 인증키 불필요)
async function fetchYahooFinance(ticker) {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const data = await res.json();
    const result = data.chart.result[0];
    const closes = result.indicators.quote[0].close;
    
    // 가장 최근의 유효한 종가 2개를 가져와 등락률 계산
    const validCloses = closes.filter(c => c !== null);
    if (validCloses.length < 2) return "데이터 없음";
    
    const current = validCloses[validCloses.length - 1];
    const previous = validCloses[validCloses.length - 2];
    
    const change = current - previous;
    const percentChange = (change / previous) * 100;
    
    const valueStr = ticker === 'KRW=X' ? current.toFixed(1) : current.toFixed(2);
    const sign = change > 0 ? '+' : ''; // 음수는 이미 '-' 기호가 포함됨
    
    return `${valueStr} (${sign}${percentChange.toFixed(2)}%)`;
  } catch (e) {
    console.error(`Yahoo Finance 에러 (${ticker}):`, e);
    return "데이터 없음";
  }
}

async function main() {
  console.log("🚀 Daily News Batch Started...");
  
  const majorNames = MAJOR_STOCKS.map(s => s.name);
  
  console.log("Generating Section 1: Macro Summary & Indices...");
  const macroNews = await fetchGoogleNews("미국 증시 마감 OR 글로벌 경제");
  
  const macroPrompt = `
  너는 글로벌 매크로 경제를 전문으로 분석하는 수석 이코노미스트야.
  다음 수집된 뉴스를 바탕으로 오늘 글로벌 거시 경제와 증시 전반의 흐름을 매우 조리 있고 상세하게 분석해줘.
  
  [작성 지침]
  1. 단순한 사실 나열이 아닌, 인과 관계(원인과 결과)가 뚜렷하고 논리적인 흐름으로 문장을 구성할 것.
  2. 주요 경제 지표(금리, 물가, 고용 등), 연준(Fed)의 스탠스, 또는 증시 전체를 움직인 핵심 테마(트리거)를 구체적으로 포함할 것.
  3. 전체 분량은 4~5문장 내외로, 단편적이지 않고 충분한 인사이트를 담아서 전문가다운 어조로 작성할 것.
  
  [뉴스 데이터]
  ${macroNews.map(n=>n.title).join('\n')}
  `;
  const macroSummary = await callGemini(macroPrompt);

  console.log("Generating Section 2: Sector Summary...");
  const sectorNews = await fetchGoogleNews("미국 증시 특징주 OR 나스닥 특징주");
  const sectorPrompt = `
  너는 수석 글로벌 투자 전략가야. 
  현재 나의 주요 투자 종목은 [${majorNames.join(', ')}] 이야.
  이 종목들을 바탕으로 나의 '핵심 관심 섹터 3개'를 도출해.
  그리고 다음 미국장 뉴스를 바탕으로 각 섹터별로 아래 JSON 양식에 맞춰 분석을 제공해.
  
  [분석 지침]
  1. 간밤 동향(overnightTrend): 미국 대장주의 간밤 움직임과 그 원인(Driver)을 구체적이고 상세하게 2~3문장으로 작성할 것.
  2. 과거 패턴(historicalImpact): 과거 비슷한 원인으로 미국 대장주가 유사한 움직임을 보였을 때, 한국 증시의 해당 섹터는 보통 어떻게 반응했었는지 1문장으로 짧고 간결하게 작성할 것.
  
  [미국장 뉴스]
  ${sectorNews.map(n=>n.title).join('\n')}
  
  [출력 형식 (반드시 JSON 배열로 응답)]
  [
    {
      "weather": "☀️ 맑음",
      "sectorName": "반도체/AI",
      "usPeer": "엔비디아",
      "overnightTrend": "간밤 동향 2문장...",
      "historicalImpact": "과거 패턴 1문장..."
    }
  ]
  `;
  const sectorSummary = await callGemini(sectorPrompt, true);

  const report = {
    date: new Date().toISOString(),
    section1: {
      sp500: await fetchYahooFinance('^GSPC'),
      nasdaq: await fetchYahooFinance('^IXIC'),
      sox: await fetchYahooFinance('^SOX'), // 필라델피아 반도체
      kospi: await fetchYahooFinance('^KS11'),
      kosdaq: await fetchYahooFinance('^KQ11'),
      exchangeRate: await fetchYahooFinance('KRW=X'), // 원/달러 환율
      summary: macroSummary
    },
    section2: {
      summary: sectorSummary,
      news: sectorNews.slice(0, 3) // 대표 뉴스 3개 첨부
    },
    section3_major: [],
    section4_interest: [],
    section5_watchlist: []
  };

  // 섹션 3: 주요 종목 (Top 7 뉴스 목표)
  console.log("Processing Section 3: Major Stocks...");
  for (const stock of MAJOR_STOCKS) {
    const news = await fetchGoogleNews(`${stock.name} 주식 (특징주 OR 리포트 OR 실적 OR 장외)`);
    const aiResult = await summarizeStock(stock.name, news, 7);
    report.section3_major.push({ ...stock, currentPrice: "장전", summary: aiResult.summary, news: aiResult.news });
    await new Promise(r => setTimeout(r, 3000));
  }

  // 섹션 4: 관심 종목 (Top 5 뉴스 목표)
  console.log("Processing Section 4: Interest Stocks...");
  for (const stock of INTEREST_STOCKS) {
    const news = await fetchGoogleNews(`${stock.name} 주식 (특징주 OR 리포트 OR 실적)`);
    const aiResult = await summarizeStock(stock.name, news, 5);
    report.section4_interest.push({ ...stock, currentPrice: "장전", summary: aiResult.summary, news: aiResult.news });
    await new Promise(r => setTimeout(r, 3000));
  }

  // 섹션 5: 관망 종목 (슬립모드 해제 로직 임시 구현)
  // 기사 수가 특정 개수를 넘거나 특정 키워드가 폭증할 때만 작동하도록 뼈대 작성
  console.log("Processing Section 5: Watchlist Stocks...");
  for (const stock of ARCHIVED_STOCKS) {
    // 임시 로직: 일단 빈 칸으로 구성 (추후 폭증 감지 알고리즘 적용 시 여기에 추가)
    // report.section5_watchlist.push({ ... });
  }

  const outPath = path.join(process.cwd(), 'src', 'data', 'latest_report.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`✅ Report generated at ${outPath}`);
}

main();
