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
  
  const TRUSTED_PUBLISHERS = /한국경제|한경|매일경제|매경|더벨|thebell|인베스트조선|Invest Chosun|블로터|넘버스|연합뉴스|연합인포맥스|뉴스1|뉴시스|전자신문|머니투데이|MT|이데일리|edaily/i;

  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  
  // 2개월 전 시점 계산
  const twoMonthsAgo = new Date();
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

  while ((match = itemRegex.exec(text)) !== null && items.length < 50) {
    const itemContent = match[1];
    const titleMatch = itemContent.match(/<title>(.*?)<\/title>/);
    const linkMatch = itemContent.match(/<link>(.*?)<\/link>/);
    const pubDateMatch = itemContent.match(/<pubDate>(.*?)<\/pubDate>/);
    
    if (!titleMatch || !linkMatch) continue;
    
    let formattedDate = '';
    if (pubDateMatch) {
      const pubDate = new Date(pubDateMatch[1]);
      if (pubDate < twoMonthsAgo) {
        continue; // 2개월 이상 지난 뉴스 필터링
      }
      formattedDate = `${pubDate.getFullYear()}.${String(pubDate.getMonth() + 1).padStart(2, '0')}.${String(pubDate.getDate()).padStart(2, '0')}`;
    }
    
    let rawTitle = titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/&quot;/g, '"');
    let isTrusted = TRUSTED_PUBLISHERS.test(rawTitle);
    let finalTitle = isTrusted ? `[★우선선택] ${rawTitle}` : rawTitle;

    items.push({ 
      title: finalTitle, 
      link: linkMatch[1],
      pubDate: formattedDate,
      isTrusted
    });
  }
  
  // 신뢰 언론사 기사가 배열 앞쪽에 오도록 정렬 (AI에게 가중치)
  items.sort((a, b) => (b.isTrusted ? 1 : 0) - (a.isTrusted ? 1 : 0));
  
  return items;
}

async function callGemini(prompt, isJson = false, retries = 3) {
  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
  if (!DEEPSEEK_API_KEY) return isJson ? { summary: 'DeepSeek API 키 누락', topNewsIndex: [0, 1] } : 'DeepSeek API 키 누락 데이터입니다.';
  
  const callModel = async () => {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + DEEPSEEK_API_KEY
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        ...(isJson && { response_format: { type: "json_object" } })
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    if (!data.choices || !data.choices[0].message) throw new Error('No content');
    return isJson ? JSON.parse(data.choices[0].message.content) : data.choices[0].message.content;
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  
  let lastErrMsg = "";
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await callModel();
    } catch (e) {
      lastErrMsg = e.message;
      console.log(`DeepSeek Error on attempt ${attempt}: ${lastErrMsg}. Waiting 3s...`);
      await sleep(3000);
    }
  }
  
  return isJson ? { summary: '딥시크 요약 에러 (' + lastErrMsg + ')', topNewsIndex: [0, 1] } : '딥시크 요약 실패';
}

// 섹션 2, 3, 4
async function summarizeStock(stockName, newsItems, maxNewsCount) {
  if (newsItems.length === 0) return { summary: "최신 뉴스가 없습니다.", news: [], industry: "분류 불가" };
  
  const prompt = `
  다음은 '${stockName}'에 대한 최신 뉴스 헤드라인들이야.
  
  [분석 및 작성 지침]
  1. 전체 요약(summary): 주가 변화 및 전망에 대한 내용은 50%로 제한하고, 나머지 50%는 기업에 대한 뉴스 내용(실적, 계약, 신제품, 경영 동향 등) 자체에 할당해. 유사한 내용을 중심으로 핵심만 압축하여 기존 대비 70% 분량으로 간결하고 밀도 있게 작성해. (개조식 Bullet point 어법 사용)
  2. 뉴스 기사 클러스터링 및 중복 제거: 수집된 기사들을 독립적인 사건(이슈) 단위로 묶고, 중복 이슈를 철저히 배제하여 최대 5개의 '유니크한 이슈 대표 기사'만 선정하라. (동일한 이슈에 대한 여러 기사 중 대표 기사를 고를 때는 반드시 제목에 '[★우선선택]' 마커가 붙은 기사를 최우선으로 채택하라. 단, 유니크한 사건이라면 마커가 없어도 포함하라.) 유니크한 사건이 적다면 억지로 5개를 채우지 마라.
  3. 뉴스 분류: 선정된 기사들 중에서 카테고리를 다음 중 하나로 지정해.
     - most_viewed: 최근에 많이 노출된 기사
     - sudden: 과거 언급 없다가 갑자기 올라오는 뉴스
  4. 산업 분류: 이 종목이 속한 시장(코스피 또는 코스닥)과 공식 산업분류명(예: 코스피 전기전자, 코스닥 제약 등)을 'industry'에 기재해.
  
  뉴스 목록:
  ${newsItems.map((n, i) => `${i}. ${n.title}`).join('\n')}
  
  [출력 형식 (반드시 JSON 객체로 응답, 모든 필드 필수 포함)]
  {
    "summary": "개조식 요약 내용 (기존보다 1.5배 분량, 기업 뉴스 내용 50% 포함)\\n- 내용1\\n- 내용2...",
    "industry": "코스피 전기전자 (이런 형식의 소속 시장 및 산업명)",
    "selectedNews": [
      {
        "index": 0,
        "category": "most_viewed 또는 sudden",
        "newTitle": "[출처] 기사 내용을 드러내는 짧고 깔끔한 요약 제목 (오늘 날짜 혹은 발행일자)",
        "articleSummary": "해당 개별 기사에 대한 상세한 요약 (수치, 인과관계, 비즈니스 임팩트 등을 포함하여 3~5문장 내외로 깊이 있게 작성)"
      }
    ]
  }
  `;
  const result = await callGemini(prompt, true);
  
  const selectedNews = (result.selectedNews || []).map(item => {
    const newsItem = newsItems[item.index];
    if (!newsItem) return null;
    
    let summaryWithDate = item.articleSummary || '';
    if (newsItem.pubDate && !summaryWithDate.includes(newsItem.pubDate)) {
      summaryWithDate += ` (${newsItem.pubDate})`;
    }

    return {
      ...newsItem,
      title: item.newTitle || newsItem.title, // 가공된 제목으로 덮어쓰기
      category: item.category,
      articleSummary: summaryWithDate
    };
  }).filter(Boolean);
  
  return { summary: result.summary || '요약 생성 실패', industry: result.industry || '분류 불가', news: selectedNews };
}

// Yahoo Finance RSS를 통한 최신 뉴스 수집
async function fetchYahooRSSNews(tickers) {
  const items = [];
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  for (const ticker of tickers) {
    try {
      const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${ticker}`;
      const response = await fetch(url);
      const text = await response.text();
      
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;
      while ((match = itemRegex.exec(text)) !== null) {
        const itemContent = match[1];
        const titleMatch = itemContent.match(/<title>(.*?)<\/title>/);
        const linkMatch = itemContent.match(/<link>(.*?)<\/link>/);
        const pubDateMatch = itemContent.match(/<pubDate>(.*?)<\/pubDate>/);
        
        if (!titleMatch || !linkMatch || !pubDateMatch) continue;
        
        const pubDate = new Date(pubDateMatch[1]);
        if (pubDate < threeDaysAgo) continue;
        
        let title = titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1');
        items.push({
          ticker,
          title,
          link: linkMatch[1],
          pubDate: pubDate.toISOString()
        });
      }
    } catch (e) {
      console.error(`Yahoo RSS Error (${ticker}):`, e.message);
    }
  }
  return items;
}

// Yahoo Finance API를 활용한 실시간 지수 수집 (1일/5일 트렌드 및 차트용 데이터 포함)
async function fetchYahooFinance(ticker) {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=10d`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const data = await res.json();
    const result = data.chart.result[0];
    const closes = result.indicators.quote[0].close;
    
    // 유효한 종가만 필터링
    const validCloses = closes.filter(c => c !== null);
    if (validCloses.length < 2) return null;
    
    // 최근 5영업일 데이터 (모자라면 있는 만큼만)
    const last5 = validCloses.slice(-5);
    
    const current = last5[last5.length - 1];
    const prev1d = last5[last5.length - 2] || current;
    const prev5d = last5[0] || current;
    
    const change1d = current - prev1d;
    const percent1d = (change1d / prev1d) * 100;
    
    const change5d = current - prev5d;
    const percent5d = (change5d / prev5d) * 100;
    
    const valueStr = ticker === 'KRW=X' ? current.toFixed(1) : current.toFixed(2);
    
    return {
      value: valueStr,
      percent1d: percent1d.toFixed(2),
      percent5d: percent5d.toFixed(2),
      history: last5, // 미니 차트용 배열
      timestamp: result.meta.regularMarketTime * 1000
    };
  } catch (e) {
    console.error(`Yahoo Finance 에러 (${ticker}):`, e);
    return null;
  }
}



// 외국인 코스피200 선물 순매수 조회 (뉴스 크롤링 기반)
async function fetchForeignFuturesFromNews() {
  try {
    const newsItems = await fetchGoogleNews("외국인 코스피200 선물 순매수");
    if (newsItems.length === 0) return null;
    
    const prompt = `
    다음은 '외국인 코스피200 선물 순매수' 관련 최신 뉴스 헤드라인들이야.
    뉴스 목록:
    ${newsItems.map((n, i) => `${i}. ${n.title}`).join('\n')}
    
    위 뉴스들을 분석하여, 가장 최근의 외국인 코스피200 선물 매매 동향(순매수 또는 순매도)과 그 규모(금액 또는 계약 수)를 추출해줘.
    
    출력 형식 (반드시 JSON):
    {
      "direction": "순매수 또는 순매도 (알 수 없으면 '알 수 없음')",
      "amount": "규모 (예: 1조 2000억원, 5000계약 등. 수치와 단위를 포함. 알 수 없으면 '알 수 없음')",
      "isPositive": true (순매수일 때) 또는 false (순매도일 때)
    }
    `;
    const result = await callGemini(prompt, true);
    if (!result || !result.direction || result.direction === '알 수 없음' || !result.amount) return null;
    
    return {
      netBuy: result.amount,
      direction: result.direction,
      rawNetBuy: result.isPositive === true ? 1 : -1
    };
  } catch (e) {
    console.error('뉴스 기반 외국인 선물 조회 에러:', e.message);
    return null;
  }
}

async function main() { try {
  console.log("🚀 Daily News Batch Started...");
  
  const majorNames = MAJOR_STOCKS.map(s => s.name);

  // 외국인 선물 순매수 (뉴스 크롤링 기반)
  console.log("Fetching Foreign Futures data from News...");
  const foreignFutures = await fetchForeignFuturesFromNews();
  if (foreignFutures) {
    console.log(`✅ 외국인 KOSPI200 선물: ${foreignFutures.direction} ${foreignFutures.netBuy}`);
  } else {
    console.log("⚠️ 외국인 선물 데이터 없음");
  }
  
  console.log("Generating Section 1: Macro Summary & Indices...");
  const macroNews = await fetchGoogleNews("미국 증시 마감 OR 글로벌 경제");
  
  const macroPrompt = `
  너는 글로벌 매크로 경제를 전문으로 분석하는 수석 이코노미스트야.
  다음 수집된 뉴스를 바탕으로 오늘 글로벌 거시 경제와 증시 전반의 흐름을 조리 있게 분석해.
  
  [작성 지침]
  1. 단순한 사실 나열이 아닌, 인과 관계(원인과 결과)가 뚜렷하고 논리적인 흐름으로 문장을 구성할 것.
  2. 전체 분량은 4~5문장 내외로, 충분한 인사이트를 담아서 전문가다운 어조로 작성할 것.
  
  [⭐특수 기능 지시사항 (가장 중요)⭐]
  생성한 요약 텍스트 안에서 가장 핵심이 되는 중요한 단어나 어구(키워드) 3~5개를 선정해.
  각 키워드에 대해, 그 배경이 된 원본 뉴스의 '한국어 요약본(2문장 내외)'과 '원본 링크'를 매핑해서 JSON 형식으로 출력해.
  
  [뉴스 데이터]
  ${macroNews.map(n=>`제목: ${n.title}, 링크: ${n.link}`).join('\n')}
  
  [출력 형식 (반드시 JSON)]
  {
    "summaryText": "여기에 4~5문장 분량의 전체 매크로 시황 요약글을 작성. (이 글 안에 아래 keywords의 word들이 정확히 똑같이 포함되어 있어야 함)",
    "keywords": [
      {
        "word": "글 안에 있는 핵심 단어/어구",
        "newsSummary": "해당 단어의 배경이 된 뉴스의 구체적인 한국어 친화적 요약",
        "originalLink": "해당 뉴스의 링크"
      }
    ]
  }
  `;
  const macroSummary = await callGemini(macroPrompt, true);

  console.log("Generating Section 2: Sector Summary & News...");
  // 미국 주요 종목 간밤 등락률 실제 데이터 수집
  const usPeerTickers = {
    NVDA: '엔비디아', TSM: 'TSMC', AMD: 'AMD', INTC: '인텔',
    AAPL: '애플', MSFT: '마이크로소프트', GOOGL: '알파벳',
    META: '메타', AMZN: '아마존', TSLA: '테슬라',
    ASML: 'ASML', AMAT: 'AMAT', QCOM: '퀄컴',
    LLY: '일라이릴리', JPM: 'JP모건', XOM: '엑손모빌'
  };
  const peerChanges = {};
  for (const [ticker, name] of Object.entries(usPeerTickers)) {
    const d = await fetchYahooFinance(ticker);
    if (d) peerChanges[name] = (parseFloat(d.percent1d) >= 0 ? '+' : '') + d.percent1d + '%';
  }
  const peerChangeLine = Object.entries(peerChanges).map(([n, v]) => n + ' ' + v).join(', ');

  console.log("Fetching Yahoo Finance RSS News for US Peers...");
  const rawYahooNews = await fetchYahooRSSNews(Object.keys(usPeerTickers));

  const sectorPrompt = `
  너는 수석 글로벌 투자 전략가야.
  현재 나의 주요 투자 종목은 [${majorNames.join(', ')}] 이야.
  핵심 관심 섹터 3개를 도출하고, JSON 배열 형식으로 분석을 제공해.

  [분석 지침]
  1. overnightTrend: 아래 [미국장 뉴스]를 중심으로 해당 섹터의 기업 동향과 주요 이슈를 서술. [실제 등락률] 수치보다는 비즈니스 맥락과 뉴스 위주로 3~4문장.
  2. historicalImpact: 과거 유사 상황에서 한국 해당 섹터 반응을 사례/퍼센트로 2~3문장.
  3. outlook: 오늘 한국 시장 개장 시 영향 2~3문장.
  4. keywords: 핵심 키워드 3~5개 (키워드만 읽어도 내용 파악 가능하도록).
  5. usPeerChange: 해당 대장주(usPeer)의 실제 등락률을 [실제 등락률] 에서 찾아 기입. 없으면 "N/A".

  [실제 등락률]
  ${peerChangeLine}

  [미국장 뉴스]
  ${rawYahooNews.map(n=>`[${n.ticker}] ${n.title}`).join("\n").substring(0, 8000)}

  [출력 형식 - 반드시 JSON 객체로 응답]
  {
    "sectors": [
      {
        "weather": "☀️ 맑음 OR ⛅ 구름 OR 🌧️ 흐림 OR ⛈️ 폭풍",
        "sectorName": "반도체/AI",
        "usPeer": "엔비디아",
        "usPeerChange": "+2.35%",
        "overnightTrend": "간밤 동향 3~4문장 (반드시 실제 등락률 포함)...",
        "historicalImpact": "과거 패턴 2~3문장...",
        "outlook": "오늘 전망 2~3문장...",
        "keywords": ["키워드1", "키워드2", "키워드3"]
      }
    ]
  }
  `;
  const sectorSummary = await callGemini(sectorPrompt, true);

  console.log("Generating Section 2: Translated Top 3 News...");
  const translatePrompt = `
  다음은 수집된 미국 주요 종목의 최신 영문 뉴스 목록이야.
  앞서 분석한 3개의 핵심 섹터는 다음과 같아: ${(sectorSummary.sectors || []).map(s => s.sectorName).join(', ')}.

  [지시사항]
  1. 전체 뉴스 중에서 가장 중요하고 임팩트 있는 기사 딱 3개만 선별해라. (각 섹터별로 골고루 매칭되면 좋지만, 전체 Top 3를 뽑는 것이 우선)
  2. 선별된 3개 기사에 대해, '제목(title)'과 '핵심 요약(articleSummary)'을 한국어로 완벽하고 자연스럽게 번역해라.
  3. 반드시 아래 JSON 배열 형식으로 반환해라.

  [뉴스 목록]
  ${rawYahooNews.map((n, i) => `[${i}] ${n.ticker}: ${n.title}`).join('\n')}

  [출력 형식 - 반드시 JSON 객체로 응답]
  {
    "news": [
      {
        "index": 뉴스목록에서의인덱스숫자,
        "category": "most_viewed 또는 sudden",
        "title": "한국어로 번역된 기사 제목",
        "articleSummary": "한국어로 번역된 3~4문장 분량의 상세한 핵심 요약",
        "sectorName": "매칭된 섹터명"
      }
    ]
  }
  `;
  const translatedNewsResult = await callGemini(translatePrompt, true);
  
  const finalSectorNews = (translatedNewsResult.news || []).map(item => {
    const rawNews = rawYahooNews[item.index];
    if (!rawNews) return null;
    return {
      title: item.title,
      link: rawNews.link,
      pubDate: rawNews.pubDate,
      category: item.category,
      articleSummary: item.articleSummary,
      isForeign: true,
      sectorName: item.sectorName
    };
  }).filter(Boolean);

  const report = {
    date: new Date().toISOString(),
    section1: {
      dowJones: await fetchYahooFinance('^DJI'),
      sp500: await fetchYahooFinance('^GSPC'),
      nasdaq: await fetchYahooFinance('^IXIC'),
      sox: await fetchYahooFinance('^SOX'), // 필라델피아 반도체
      kospi: await fetchYahooFinance('^KS11'),
      kosdaq: await fetchYahooFinance('^KQ11'),
      exchangeRate: await fetchYahooFinance('KRW=X'), // 원/달러 환율
      wti: await fetchYahooFinance('CL=F'), // WTI 원유
      foreignFutures: foreignFutures, // 외국인 KOSPI200 선물 순매수 (KIS API)
      summary: macroSummary
    },
    section2: {
      summary: sectorSummary,
      news: finalSectorNews // 야후 번역 기사 3개 첨부
    },
    section3_major: [],
    section4_interest: [],
    section5_watchlist: []
  };

  // 섹션 3: 주요 종목 (Top 7 뉴스 목표)
  console.log("Processing Section 3: Major Stocks...");
  for (const stock of MAJOR_STOCKS) {
    const news = await fetchGoogleNews(`${stock.name} (특징주 OR 실적 OR 뉴스 OR 공시 OR 리포트 OR 신제품 OR 계약 OR 경영)`);
    const aiResult = await summarizeStock(stock.name, news, 7);
    report.section3_major.push({ ...stock, currentPrice: "장전", summary: aiResult.summary, industry: aiResult.industry, news: aiResult.news });
    
  }

  // 섹션 4: 관심 종목 (Top 5 뉴스 목표)
  console.log("Processing Section 4: Interest Stocks...");
  for (const stock of INTEREST_STOCKS) {
    const news = await fetchGoogleNews(`${stock.name} (특징주 OR 실적 OR 뉴스 OR 공시 OR 리포트 OR 신제품 OR 계약 OR 경영)`);
    const aiResult = await summarizeStock(stock.name, news, 5);
    report.section4_interest.push({ ...stock, currentPrice: "장전", summary: aiResult.summary, industry: aiResult.industry, news: aiResult.news });
    
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
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8"); } catch(err) { console.error("FATAL ERROR:", err); const outPath = path.join(process.cwd(), "src", "data", "deepseek_report.json"); fs.writeFileSync(outPath, JSON.stringify({date: new Date().toISOString(), section1: {summary: "ERROR: " + err.message + " " + err.stack}})); process.exit(0); } } main();









