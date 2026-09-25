import fs from 'fs';
import path from 'path';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const profilePath = path.join(process.cwd(), 'src', 'data', 'user_profile.json');
const userProfile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

const MAJOR_STOCKS = userProfile.stocks.filter(s => s.type === 'major');
const INTEREST_STOCKS = userProfile.stocks.filter(s => s.type === 'interest');
const ARCHIVED_STOCKS = userProfile.stocks.filter(s => s.type === 'archived');

function formatToYYMMDD(dateObj) {
  const yy = String(dateObj.getFullYear()).slice(-2);
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${yy}/${mm}/${dd}`;
}

async function fetchGoogleNews(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
  const response = await fetch(url);
  const text = await response.text();
  const items = [];
  
  const TRUSTED_PUBLISHERS = /한국경제|한경|매일경제|매경|더벨|thebell|인베스트조선|Invest Chosun|블로터|넘버스|연합뉴스|연합인포맥스|뉴스1|뉴시스|전자신문|머니투데이|MT|이데일리|edaily/i;

  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  
  const twoMonthsAgo = new Date();
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

  while ((match = itemRegex.exec(text)) !== null && items.length < 50) {
    const itemContent = match[1];
    const titleMatch = itemContent.match(/<title>(.*?)<\/title>/);
    const linkMatch = itemContent.match(/<link>(.*?)<\/link>/);
    const pubDateMatch = itemContent.match(/<pubDate>(.*?)<\/pubDate>/);
    const descMatch = itemContent.match(/<description>([\s\S]*?)<\/description>/);
    
    if (!titleMatch || !linkMatch) continue;
    
    let formattedDate = '';
    if (pubDateMatch) {
      const pubDate = new Date(pubDateMatch[1]);
      if (pubDate < twoMonthsAgo) continue;
      formattedDate = formatToYYMMDD(pubDate);
    }
    
    let description = '';
    if (descMatch) {
      description = descMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      description = description.substring(0, 300);
    }
    
    // 미리보기가 없거나 너무 짧으면(영양가 없으면) AI 환각 방지를 위해 아예 제외
    if (!description || description.length < 20) continue;
    
    const sourceMatch = itemContent.match(/<source[^>]*>(.*?)<\/source>/);
    let publisher = sourceMatch ? sourceMatch[1] : '';
    let shortPub = publisher.replace(/[^가-힣a-zA-Z0-9]/g, '').substring(0, 3);
    
    let rawTitle = titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/&quot;/g, '"');
    if (publisher) {
      rawTitle = rawTitle.replace(new RegExp(` - ${publisher.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '').trim();
    }
    
    let isTrusted = TRUSTED_PUBLISHERS.test(publisher) || TRUSTED_PUBLISHERS.test(rawTitle);
    let finalTitle = shortPub ? `[${shortPub}] ${rawTitle}` : rawTitle;
    if (isTrusted) {
      finalTitle = `[★우선선택] ${finalTitle}`;
    }

    items.push({ 
      title: finalTitle, 
      link: linkMatch[1],
      pubDate: formattedDate,
      description,
      isTrusted
    });
  }
  
  items.sort((a, b) => (b.isTrusted ? 1 : 0) - (a.isTrusted ? 1 : 0));
  
  return items;
}

async function callGemini(prompt, isJson = false, retries = 3, useReasoner = false) {
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
        model: useReasoner ? "deepseek-reasoner" : "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        ...(isJson && !useReasoner && { response_format: { type: "json_object" } })
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    if (!data.choices || !data.choices[0].message) throw new Error('No content');
    
    let content = data.choices[0].message.content;
    if (isJson) {
      // Reasoner 모델이 마크다운(```json)으로 감싸서 보낼 경우를 대비해 껍데기 제거
      content = content.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
      return JSON.parse(content);
    }
    return content;
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
  1. 🤖 AI 전체 요약(summary) 작성 규칙 (가장 중요):
     - 절대 수집된 모든 기사를 앵무새처럼 줄줄이 나열하지 마라.
     - 산발적인 정보들을 종합하여, 전체 흐름이 한눈에 읽히는 **단 3~4개의 핵심 불릿 포인트(-)**로 완벽하게 압축 및 구조화하라.
     - "9월 9일 2% 상승", "9월 21일 3% 하락" 같은 무의미한 일일 주가 등락 나열은 모조리 삭제하라. 대신 "자회사 로보틱스 상장 추진 및 유상증자로 인한 주가 모멘텀 상승"과 같이 굵직한 '원인'과 '결과'로만 묶어서 서술하라.
     - [기업 동향(실적/계약/신사업)]과 [시장 반응(주가 흐름)]을 균형 있게 녹여내어 밀도 있게 작성하라.
  2. 뉴스 기사 클러스터링 및 중복 제거: 수집된 기사들을 독립적인 사건(이슈) 단위로 묶고, 중복 이슈를 철저히 배제하여 최대 5개의 '유니크한 이슈 대표 기사'만 선정하라. ([★우선선택] 마커가 붙은 기사가 있다면 무조건 최우선으로 채택하라.)
  3. 산업 분류: 이 종목이 속한 시장(코스피 또는 코스닥)과 공식 산업분류명(예: 코스피 전기전자, 코스닥 제약 등)을 'industry'에 기재해.
  4. 절대 제공된 뉴스 목록(제목 및 미리보기)에 없는 내용을 상상해서 작성하거나 지어내지 마라.
  
  뉴스 목록:
  ${newsItems.map((n, i) => `[인덱스: ${i}] 제목: ${n.title}\n미리보기: ${n.description}`).join('\n\n')}
  
  [출력 형식 (반드시 JSON 객체로 응답, 모든 필드 필수 포함)]
  {
    "summary": "구조화된 핵심 요약 (반드시 3~4개의 불릿 포인트로만 압축할 것)\\n- 핵심 요약 1\\n- 핵심 요약 2\\n- 핵심 요약 3",
    "industry": "코스피 전기전자 (이런 형식의 소속 시장 및 산업명)",
    "selectedNews": [
      {
        "index": 0,
        "newTitle": "기사 내용을 드러내는 짧고 깔끔한 요약 제목 (원본 제목에 있는 [언론사] 태그는 반드시 그대로 유지할 것. 제목 끝에 임의의 날짜를 절대 추가하지 말 것)",
        "articleSummary": "해당 개별 기사에 대한 요약 (반드시 제공된 '미리보기' 내용 내에서만 팩트 기반으로 2~3문장 작성. 절대 배경지식을 동원해 지어내지 말 것)"
      }
    ]
  }
  `;
  const result = await callGemini(prompt, true);
  
  // 100% 알고리즘 기반 카테고리 판별 함수 (AI 환각 배제)
  const categorizeNews = (title, allNewsItems) => {
    const words = title.split(/\s+/).filter(w => w.length >= 2).map(w => w.replace(/[^가-힣a-zA-Z0-9]/g, ''));
    let matchCount = 0;
    for (const item of allNewsItems) {
      if (words.filter(w => item.title.includes(w)).length >= 2) matchCount++;
    }
    if (matchCount >= 3) return 'most_viewed'; // 유사 기사가 3개 이상이면 집중 보도된 "주목"
    if (/단독|최초|돌연|갑자기|급등|급락|신규|깜짝|속보/.test(title)) return 'sudden'; // 모멘텀 키워드가 있으면 "상승"
    return 'most_viewed'; // 기본값
  };

  const selectedNews = (result.selectedNews || []).map(item => {
    const newsItem = newsItems[item.index];
    if (!newsItem) return null;
    
    let cleanTitle = item.newTitle ? item.newTitle.replace(/\[★우선선택\]\s*/g, '') : newsItem.title.replace(/\[★우선선택\]\s*/g, '');
    
    // AI가 자의적으로 붙인 일련번호(예: "1. ", "2. ") 강제 제거
    cleanTitle = cleanTitle.replace(/^\d+\.\s*/, '');

    if (newsItem.pubDate && !cleanTitle.includes(newsItem.pubDate)) {
      cleanTitle += ` (${newsItem.pubDate})`;
    }

    const determinedCategory = categorizeNews(cleanTitle, newsItems);

    return {
      ...newsItem,
      title: cleanTitle,
      category: determinedCategory,
      articleSummary: item.articleSummary || ''
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
        const descMatch = itemContent.match(/<description>([\s\S]*?)<\/description>/);
        
        if (!titleMatch || !linkMatch || !pubDateMatch) continue;
        
        const pubDate = new Date(pubDateMatch[1]);
        if (pubDate < threeDaysAgo) continue;
        
        let title = titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1');
        let description = '';
        if (descMatch) {
          description = descMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          description = description.substring(0, 400);
        }

        // 영문 기사도 미리보기가 부실하면 제외
        if (!description || description.length < 20) continue;

        items.push({
          ticker,
          title,
          link: linkMatch[1],
          pubDate: formatToYYMMDD(pubDate),
          description
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
    const encodedTicker = encodeURIComponent(ticker);
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodedTicker}?interval=1d&range=10d`, {
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
    [주의 사항]
    절대 임의의 수치를 상상해서 지어내지 말고, 기사 제목에 명시된 수치만 정확히 추출하라. 기사에 명확한 수치가 없다면 '알 수 없음'으로 처리하라.
    
    출력 형식 (반드시 JSON):
    {
      "direction": "순매수 또는 순매도 (알 수 없으면 '알 수 없음')",
      "amount": "규모 (예: 1조 2000억원, 5000계약 등. 수치와 단위를 포함. 기사에 명시된 수치가 없으면 '알 수 없음')",
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
  
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  console.log("Generating Section 1: Macro Summary & Indices...");
  const macroNews = await fetchGoogleNews("미국 증시 마감 OR 글로벌 경제");
  
  const macroPrompt = `
  당신은 여의도 최고의 거시경제 및 시황 전문 수석 애널리스트입니다.
  수집된 국내외 주요 언론사들의 시황 분석 기사들을 단순한 정보가 아닌 '가설의 출발점'으로 삼아, 오늘 글로벌 거시 경제와 증시 전반의 흐름을 심도 있게 연구하고 보완하십시오.
  
  [작성 지침]
  1. "최근 글로벌 증시는..." 같은 뻔하고 영양가 없는 서론은 절대 사용하지 마라.
  2. 단순 사실이나 지표를 앵무새처럼 나열하며 결론 없는 이야기만 양산하는 '똑똑한 바보'가 되지 마라. 
  3. 반드시 수집된 정보들을 종합하여, **"그래서 오늘 국내/글로벌 시장이 어떤 방향(상승/하락/보합/섹터차별화 등)으로 흘러갈 것인가?"**에 대한 명확한 결론적 지향점(Market Direction)을 확신에 찬 어조로 제시하라.
  4. 어머님이 모바일에서 읽기 편하도록, 한 가지 주제나 흐름이 끝날 때마다 반드시 줄바꿈(\\n\\n)을 두 번씩 넣어서 3~4개의 굵직한 문단으로 구성하라.
  5. 할루시네이션(거짓 정보)을 철저히 배제하고, 제공된 뉴스 데이터와 실제 지표에 입각하여 논리적으로 서술하라.
  
  [⭐특수 기능 지시사항 (가장 중요)⭐]
  생성한 요약 텍스트 안에서 가장 핵심이 되는 중요한 단어나 어구(키워드) 3~5개를 선정해.
  각 키워드에 대해, 그 배경이 된 원본 뉴스의 '한국어 요약본(2문장 내외)'과 해당 뉴스의 인덱스 번호(newsIndex)를 매핑해서 JSON 형식으로 출력해.
  
  [뉴스 데이터]
  ${macroNews.map((n, i)=>`[인덱스: ${i}] 제목: ${n.title}\n미리보기: ${n.description}`).join('\n\n')}
  
  [출력 형식 (반드시 JSON)]
  {
    "summaryText": "위 지침에 따라 3~4개 문단(\\n\\n 포함)으로 작성된 거시 경제 요약 및 명확한 방향성 결론",
    "keywords": [
      {
        "word": "summaryText 안에 실제로 존재하는 정확히 일치하는 단어/어구",
        "newsSummary": "해당 단어의 배경이 된 뉴스의 구체적인 한국어 친화적 요약",
        "newsIndex": 매핑할 뉴스 데이터의 정수형 인덱스 숫자 (지어내지 말 것)
      }
    ]
  }
  `;
  const macroSummary = await callGemini(macroPrompt, true, 3, true); // 1회 한정 최상위 추론 모델(deepseek-reasoner) 가동!
  
  if (macroSummary.keywords) {
    macroSummary.keywords.forEach(kw => {
      if (typeof kw.newsIndex === 'number' && macroNews[kw.newsIndex]) {
        kw.originalLink = macroNews[kw.newsIndex].link;
      }
    });
  }

  console.log("Generating Section 2: Sector Summary & News...");
  // 미국 주요 종목 간밤 등락률 실제 데이터 수집
  const usPeerTickers = {
    // 반도체 및 장비
    NVDA: '엔비디아(AI반도체)', TSM: 'TSMC(파운드리)', AMD: 'AMD(반도체)', INTC: '인텔(반도체)', ASML: 'ASML(반도체장비)', AMAT: 'AMAT(반도체장비)', QCOM: '퀄컴(팹리스)', MU: '마이크론(메모리)', AVGO: '브로드컴(네트워크반도체)',
    // 빅테크 플랫폼
    AAPL: '애플(IT기기)', MSFT: '마이크로소프트(SW)', GOOGL: '알파벳(플랫폼)', META: '메타(SNS)', AMZN: '아마존(상거래)', NFLX: '넷플릭스(미디어)',
    // 모빌리티 / 2차전지
    TSLA: '테슬라(전기차)', TM: '도요타(완성차)',
    // 헬스케어 / 바이오
    LLY: '일라이릴리(비만치료제)', JNJ: '존슨앤존슨(제약)', NVO: '노보노디스크(바이오)', UNH: '유나이티드헬스(의료)',
    // 금융 / 결제
    JPM: 'JP모건(은행)', BAC: '뱅크오브아메리카(은행)', V: '비자(결제)', GS: '골드만삭스(투자은행)',
    // 화학 / 소재 / 에너지
    XOM: '엑손모빌(정유)', CVX: '쉐브론(에너지)', LIN: '린데(화학가스)', ALB: '알버말(리튬)', FCX: '프리포트-맥모란(구리)', DOW: '다우(화학)',
    // 소비재 / 유통
    WMT: '월마트(유통)', KO: '코카콜라(식음료)', PG: 'P&G(필수소비재)',
    // 산업재 / 방산
    LMT: '록히드마틴(방산)', CAT: '캐터필러(기계장비)'
  };
  const peerData = {};
  
  // 병렬 분할 수집 (야후 API 차단 방지를 위해 10개씩 묶어서 처리)
  const entries = Object.entries(usPeerTickers);
  const chunkSize = 10;
  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize);
    await Promise.all(chunk.map(async ([ticker, name]) => {
      const d = await fetchYahooFinance(ticker);
      if (d) {
        const isPos = parseFloat(d.percent1d) >= 0;
        peerData[name] = { 
          name, 
          market: ticker.includes('.') ? '기타' : (ticker === 'TSM' ? 'NYSE' : 'NASDAQ'),
          price: d.value, 
          change: (isPos ? '+' : '') + d.percent1d + '%' 
        };
      }
    }));
    await sleep(200); // 청크 사이의 미세한 휴식
  }

  const peerChangeLine = Object.values(peerData).map(p => `${p.name} ${p.change}`).join(', ');

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
  5. usPeers: 해당 섹터와 연관된 미국 대장주를 반드시 아래 [미국장 대장주 목록]에서 가장 논리적으로 적합한 종목만 골라 배열로 나열하라. (예: ["엔비디아(AI반도체)"]). 종목명 뒤의 괄호 안 섹터 힌트(예: 화학, 금융 등)를 반드시 참고하여, 전혀 엉뚱한 산업의 기업(예: 2차전지 소재 섹터에 JP모건)을 매핑하는 치명적인 실수를 절대 하지 마라. 만약 도출한 국내 섹터와 매칭되는 미국 종목이 목록에 단 하나도 없다면 억지로 끼워 맞추지 말고 빈 배열 [] 을 반환하라.

  [미국장 대장주 목록 및 간밤 등락률]
  ${peerChangeLine}

  [미국장 뉴스]
  ${rawYahooNews.map(n=>`[${n.ticker}] ${n.title}\n미리보기: ${n.description}`).join("\n\n").substring(0, 10000)}

  [출력 형식 - 반드시 JSON 객체로 응답]
  {
    "sectors": [
      {
        "weather": "☀️ 맑음 OR ⛅ 구름 OR 🌧️ 흐림 OR ⛈️ 폭풍",
        "sectorName": "반도체/AI",
        "usPeers": ["엔비디아", "AMD", "TSMC"],
        "overnightTrend": "간밤 동향 3~4문장 (반드시 실제 등락률 포함)...",
        "historicalImpact": "과거 패턴 2~3문장...",
        "outlook": "오늘 전망 2~3문장...",
        "keywords": ["키워드1", "키워드2", "키워드3"]
      }
    ]
  }
  `;
  const sectorSummary = await callGemini(sectorPrompt, true);

  console.log("Generating Section 2: Translated Top 3 News per Sector...");
  const translatePrompt = `
  다음은 수집된 미국 주요 종목의 최신 영문 뉴스 목록이야.
  앞서 분석한 3개의 핵심 섹터는 다음과 같아: [ ${(sectorSummary.sectors || []).map(s => `"${s.sectorName}"`).join(', ')} ].

  [지시사항]
  1. 앞서 분석한 3개의 핵심 섹터 각각에 대해, 아래 제공된 [뉴스 목록]에서 가장 중요하고 임팩트 있는 기사를 딱 3개씩 선별해라. (총 9개)
  2. 선별된 9개 기사에 대해, '제목(title)'과 '핵심 요약(articleSummary)'을 한국어로 완벽하고 자연스럽게 번역해라.
  3. 반드시 제공된 [뉴스 목록]의 미리보기 내용만을 바탕으로 번역 및 요약해야 하며, 배경지식을 동원해 없는 내용을 지어내지 마라.
  4. 반드시 아래 JSON 배열 형식으로 반환해라. (이때 sectorName은 위에서 제시된 3개의 핵심 섹터명 배열 중 하나와 토씨 하나 틀리지 않고 100% 동일한 문자열로 적어야 매칭이 된다)

  [뉴스 목록]
  ${rawYahooNews.map((n, i) => `[인덱스: ${i}] ${n.ticker}: ${n.title}\n미리보기: ${n.description}`).join('\n\n')}

  [출력 형식 - 반드시 JSON 객체로 응답]
  {
    "news": [
      {
        "index": 뉴스목록에서의인덱스숫자,
        "title": "한국어로 번역된 기사 제목",
        "articleSummary": "기사의 핵심 요약 (제공된 미리보기 내용을 바탕으로 완벽하게 번역 및 요약. 없는 내용 지어내기 엄격히 금지)",
        "sectorName": "위 3개의 섹터명 중 하나와 정확히 일치하는 문자열 복사붙여넣기"
      }
    ]
  }
  `;
  const translatedNewsResult = await callGemini(translatePrompt, true);
  
  const finalSectorNews = (translatedNewsResult.news || []).map(item => {
    const rawNews = rawYahooNews[item.index];
    if (!rawNews) return null;
    
    // 외신도 동일한 알고리즘으로 카테고리 판별
    const words = item.title.split(/\s+/).filter(w => w.length >= 2).map(w => w.replace(/[^가-힣a-zA-Z0-9]/g, ''));
    let matchCount = 0;
    for (const n of rawYahooNews) {
      if (words.filter(w => n.title.includes(w)).length >= 2) matchCount++;
    }
    let determinedCategory = 'most_viewed';
    if (matchCount >= 2) determinedCategory = 'most_viewed';
    else if (/단독|최초|돌연|갑자기|급등|급락|신규|깜짝|속보|최고|최저/.test(item.title)) determinedCategory = 'sudden';

    return {
      title: `${item.title} (${rawNews.pubDate})`,
      link: rawNews.link,
      pubDate: rawNews.pubDate,
      category: determinedCategory,
      articleSummary: item.articleSummary,
      isForeign: true,
      sectorName: item.sectorName
    };
  }).filter(Boolean);

  // 섹터 객체 안에 peers와 news 배열 매핑
  if (sectorSummary.sectors) {
    for (let sector of sectorSummary.sectors) {
      sector.peers = (sector.usPeers || []).map(p => peerData[p]).filter(Boolean);
      sector.news = finalSectorNews.filter(n => n.sectorName === sector.sectorName).slice(0, 3);
    }
  }

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
    await sleep(1500); // API Rate Limit 방지용 휴식
  }

  // 섹션 4: 관심 종목 (Top 5 뉴스 목표)
  console.log("Processing Section 4: Interest Stocks...");
  for (const stock of INTEREST_STOCKS) {
    const news = await fetchGoogleNews(`${stock.name} (특징주 OR 실적 OR 뉴스 OR 공시 OR 리포트 OR 신제품 OR 계약 OR 경영)`);
    const aiResult = await summarizeStock(stock.name, news, 5);
    report.section4_interest.push({ ...stock, currentPrice: "장전", summary: aiResult.summary, industry: aiResult.industry, news: aiResult.news });
    await sleep(1500); // API Rate Limit 방지용 휴식
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









