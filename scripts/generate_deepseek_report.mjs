import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fetchAllKRXCodes } from './krx_codes.mjs';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const profilePath = path.join(process.cwd(), 'src', 'data', 'user_profile.json');
const userProfile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

const MAJOR_STOCKS = userProfile.stocks.filter(s => s.type === 'major');
const INTEREST_STOCKS = userProfile.stocks.filter(s => s.type === 'interest');
const ARCHIVED_STOCKS = userProfile.stocks.filter(s => s.type === 'archived');

function formatToYYMMDD(dateObj) {
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${mm}/${dd}`;
}

// ==========================================
// Layer 1: 통계 엔진 및 캐시 관리
// ==========================================
const CACHE_PATH = path.join(process.cwd(), 'src', 'data', 'news_cache.json');

function loadCache() {
  if (fs.existsSync(CACHE_PATH)) {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  }
  return { version: "2.0", lastUpdated: "", stocks: {} };
}

function saveCache(cache) {
  cache.lastUpdated = new Date().toISOString();
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
}

function housekeeping(cache) {
  const now = new Date();
  const nowTime = now.getTime();
  
  for (const stockName in cache.stocks) {
    const stockData = cache.stocks[stockName];
    // 91일 경과 baseline 삭제
    stockData.baseline.entries = stockData.baseline.entries.filter(e => {
      return (nowTime - new Date(e.date).getTime()) < 91 * 24 * 60 * 60 * 1000;
    });
    // 31일 경과 output_pool 삭제
    stockData.output_pool.entries = stockData.output_pool.entries.filter(e => {
      return (nowTime - new Date(e.date).getTime()) < 31 * 24 * 60 * 60 * 1000;
    });
    
    // 콜드스타트 보호 해제 확인 (14일 경과)
    if (!stockData.stockProfile.warmupComplete) {
      const regDate = new Date(stockData.stockProfile.registeredAt);
      if ((nowTime - regDate.getTime()) >= 14 * 24 * 60 * 60 * 1000) {
        stockData.stockProfile.warmupComplete = true;
      }
    }
  }
}

function getPublisherScore(publisher) {
  if (!publisher) return 0;
  const t1 = /한국경제|매일경제|연합뉴스|더벨|인베스트조선|블로터|넘버스/i;
  const t2 = /뉴스1|뉴시스|전자신문|연합인포맥스/i;
  const t3 = /머니투데이|이데일리/i;
  if (t1.test(publisher)) return 20;
  if (t2.test(publisher)) return 12;
  if (t3.test(publisher)) return 8;
  return 0;
}

function extractKeywords(title) {
  return title.split(/\s+/).filter(w => w.length >= 2).map(w => w.replace(/[^가-힣a-zA-Z0-9]/g, '')).filter(w => w.length > 0);
}

function calculateScores(article, stockData) {
  const now = new Date();
  const pubDate = new Date(article.pubDate || now);
  const diffDays = Math.floor((now - pubDate) / (1000 * 60 * 60 * 24));
  
  // 1. Recency Score
  let recencyScore = 0;
  if (diffDays <= 1) recencyScore = 40;
  else if (diffDays <= 3) recencyScore = 20;
  else if (diffDays <= 7) recencyScore = 10;
  
  // 2. Publisher Score
  let publisherScore = getPublisherScore(article.publisher);
  
  // 3. Cluster Score (기준 완화: 4개만 겹쳐도 20점 '주목')
  const pool = stockData.output_pool.entries;
  let clusterMatchCount = 0;
  for (const poolItem of pool) {
    if (poolItem.id === article.id) continue;
    const matchCount = article.keywords.filter(k => poolItem.keywords.includes(k)).length;
    if (matchCount >= 2) clusterMatchCount++;
  }
  let clusterScore = 0;
  if (clusterMatchCount >= 7) clusterScore = 30;
  else if (clusterMatchCount >= 4) clusterScore = 20;
  else if (clusterMatchCount >= 2) clusterScore = 10;
  
  // 4. Anomaly Score (Z-Score 방식, Laplace smoothing 완화)
  let anomalyScore = 0;
  let recentFreq = 0;
  let baselineFreq = 0;
  const baseline = stockData.baseline.entries;
  
  // 3개월 중 최근 3일 vs 그 이전
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const recentEntries = baseline.filter(e => new Date(e.date) >= threeDaysAgo);
  const pastEntries = baseline.filter(e => new Date(e.date) < threeDaysAgo);
  
  // 키워드별 등장 빈도 평균 계산
  let maxRatio = 0;
  for (const kw of article.keywords) {
    const recentCount = recentEntries.filter(e => e.keywords.includes(kw)).length;
    const pastCount = pastEntries.filter(e => e.keywords.includes(kw)).length;
    const pastDays = Math.max(1, (threeDaysAgo - new Date(stockData.stockProfile.registeredAt)) / (1000 * 60 * 60 * 24));
    const dailyRecent = recentCount / 3;
    const dailyPast = pastCount / pastDays;
    
    // 초기 데이터가 없을 때 뱃지가 안 뜨는 현상 방지를 위해 0.5 -> 0.2로 완화
    const ratio = dailyRecent / (dailyPast + 0.2);
    if (ratio > maxRatio) maxRatio = ratio;
  }
  
  if (maxRatio >= 5.0) anomalyScore = 50;
  else if (maxRatio >= 3.0) anomalyScore = 30;
  else if (maxRatio >= 1.5) anomalyScore = 10;
  
  // 콜드스타트 보호 (AnomalyScore 0점 강제화 제거, 가중치만 부여)
  if (!stockData.stockProfile.warmupComplete) {
    recencyScore *= 1.2;
    publisherScore *= 1.2;
  }
  
  // 5. Decay Factor
  const decayFactor = Math.pow(0.85, diffDays);
  
  const totalScore = (recencyScore + publisherScore + clusterScore + anomalyScore) * decayFactor;
  
  return { recencyScore, publisherScore, clusterScore, anomalyScore, decayFactor, totalScore };
}



async function fetchNaverNews(query) {
  const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
  const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) return [];
  
  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=20&sort=sim`;
  try {
    const res = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_CLIENT_SECRET
      }
    });
    const data = await res.json();
    if (!data.items) return [];
    
    return data.items.map(item => {
      let title = item.title.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
      let description = item.description.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
      return {
        title: '[네이버] ' + title,
        link: item.link,
        pubDate: formatToYYMMDD(new Date(item.pubDate)),
        description: description,
        isTrusted: true,
        publisher: '네이버'
      };
    });
  } catch (e) {
    console.error('Naver API error:', e.message);
    return [];
  }
}

async function fetchNaverPollingData(code) {
  try {
    const res = await fetch(`https://polling.finance.naver.com/api/realtime/domestic/stock/${code}`);
    const data = await res.json();
    const stock = data.datas[0];
    if (stock) {
      return {
        volume: parseFloat(stock.accumulatedTradingVolumeRaw || 0),
        marketCap: parseFloat(stock.marketValueFullRaw || 0)
      };
    }
  } catch (e) {
    console.error('Naver Polling Error:', code, e.message);
  }
  return { volume: 0, marketCap: 0 };
}

async function fetchGoogleNews(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
  const response = await fetch(url);
  const text = await response.text();
  const items = [];
  
  const TRUSTED_PUBLISHERS = /한국경제|한경|매일경제|매경|더벨|thebell|인베스트조선|Invest Chosun|블로터|넘버스|연합뉴스|연합인포맥스|뉴스1|뉴시스|전자신문|머니투데이|MT|이데일리|edaily/i;

  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

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
      if (pubDate < oneMonthAgo) continue;
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
    
    
    let rawTitle = titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/&quot;/g, '"');
    if (publisher) {
      rawTitle = rawTitle.replace(new RegExp(` - ${publisher.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '').trim();
    }
    
    let isTrusted = TRUSTED_PUBLISHERS.test(publisher) || TRUSTED_PUBLISHERS.test(rawTitle);
    let finalTitle = publisher ? `[${publisher}] ${rawTitle}` : rawTitle;
    if (isTrusted) {
      finalTitle = `[★우선선택] ${finalTitle}`;
    }

    items.push({ 
      title: finalTitle, 
      link: linkMatch[1],
      pubDate: formattedDate,
      description,
      isTrusted,
      publisher // 새로 추가
    });
  }
  
  items.sort((a, b) => (b.isTrusted ? 1 : 0) - (a.isTrusted ? 1 : 0));
  
  return items;
}

// 2-Track 수집 및 Layer 1 파이프라인 처리
async function processLayer1(stockName, cache) {
  if (!cache.stocks[stockName]) {
    cache.stocks[stockName] = {
      baseline: { entries: [] },
      output_pool: { entries: [] },
      stockProfile: {
        registeredAt: new Date().toISOString(),
        avgDailyArticleCount: 0.0,
        warmupComplete: false
      }
    };
  }
  
  const stockData = cache.stocks[stockName];
  
  // 2-Track 쿼리 수집
  const query_main = `${stockName} (실적 OR 계약 OR 신사업 OR 투자 OR 인수 OR 신제품)`;
  const query_risk = `${stockName} (소송 OR 리스크 OR 조사 OR 지배구조 OR 매각 OR 분쟁)`;
  
  const mainNews = await fetchGoogleNews(query_main);
  const riskNews = await fetchGoogleNews(query_risk);
  const naverNews = await fetchNaverNews(stockName);
  const combinedNews = [...mainNews, ...riskNews, ...naverNews];
  
  // 중복 제거 및 캐시 저장
  for (const item of combinedNews) {
    const hash = crypto.createHash('sha256').update(item.link).digest('hex');
    item.id = hash;
    
    // 이미 output_pool에 있으면 스킵
    if (stockData.output_pool.entries.find(e => e.id === hash)) continue;
    
    // 키워드 추출
    item.keywords = extractKeywords(item.title);
    
    // 스코어링
    item.stats = calculateScores(item, stockData);
    
    // 캐시 저장
    stockData.output_pool.entries.push(item);
    stockData.baseline.entries.push({
      date: item.pubDate || new Date().toISOString(),
      keywords: item.keywords
    });
  }
  
  // 통계 기반 정렬 (최상위 15개 추출용)
  stockData.output_pool.entries.sort((a, b) => b.stats.totalScore - a.stats.totalScore);
  return stockData.output_pool.entries.slice(0, 15);
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

// 섹션 2, 3, 4 (Layer 2 & Layer 3)
async function summarizeStock(stockName, newsItems, maxNewsCount) {
  if (newsItems.length === 0) return { summary: "최신 뉴스가 없습니다.", news: [], industry: "분류 불가" };
  
  const prompt = `
  다음은 '${stockName}'에 대한 최신 뉴스 헤드라인들이야.
  
  [분석 및 작성 지침 (할루시네이션 엄격 방지)]
  1. 🤖 AI 전체 요약(summary) 작성 규칙:
     - 수집된 기사들의 산발적인 정보들을 종합하여, 전체 흐름이 한눈에 읽히는 **단 3~4개의 핵심 불릿 포인트(-)**로 완벽하게 압축하라.
     - "자회사 상장 추진 및 유상증자로 인한 주가 모멘텀 상승"과 같이 굵직한 '원인'과 '결과'로만 묶어서 서술하라. 단, 기사 내용에 '결과'나 '시장 반응'이 명확히 명시된 경우에만 서술하며, 기사에 없는 시장 반응을 배경지식을 동원해 임의로 지어내지 마라.
  
  2. 🚫 홍보 복제 기사 탈락 규칙 (필수):
     다음 유형은 '홍보 복제 기사'로 분류하여 즉시 탈락시켜라:
       ① 여러 매체가 동일 내용을 베낀 단순 MOU/협약 기사
       ② 실적 수치 없이 "사상 최대" 등 미사여구만 있는 홍보성 기사
       ③ 주가 등락 수치만 단순 나열하는 시황 기사
     '주가 펀더멘털에 직접 영향을 주는 사건' 위주로만 최종 ${maxNewsCount}개를 선별하라.

  3. 뉴스 기사 클러스터링 및 중복 제거: 중복 이슈를 철저히 배제하여 최대 ${maxNewsCount}개의 '유니크한 이슈 대표 기사'만 선정하라. ([★우선선택] 마커가 최우선)
  4. 산업 분류: 이 종목이 속한 시장(코스피 또는 코스닥)과 공식 산업분류명(예: 코스피 전기전자)을 'industry'에 기재해. (임의 창작 금지, 보편적/공식적인 분류만 사용할 것)
  5. ⚠️ 할루시네이션 방지: 할루시네이션이란 제공된 뉴스에 없는 사실을 AI가 임의로 창작하여 진실처럼 말하는 현상을 뜻한다. 절대 제공된 뉴스 목록(제목 및 미리보기)에 없는 구체적 수치, 기업 관계, 인과관계를 상상해서 추가하거나 지어내지 마라. 불확실한 경우 '알 수 없음'이라고 명시하라.
  6. 시각적 강조(데이터 잉크) - ⚠️ 의미 골격(Semantic Skeleton) 추출 알고리즘:
     - 수학적 요약(Compression): 이 문장의 본래 의미를 훼손하지 않으면서 가장 적은 수의 단어만 남긴다고 가정하라. 그렇게 남겨진 '핵심 뼈대(주체+수치+방향성 동사)'에만 마크다운(**)을 적용하라.
     - 맥락의 연속성: 텍스트에서 강조된 부분만 차례대로 이어서 읽었을 때(Telegraphic summary), 전체 문장의 인과관계와 문맥이 왜곡 없이 완벽하게 이해되어야 한다. 
       * Bad: **100조** ... **기대치** ... **파운드리** (단절됨)
       * Good: **100조 원**을 넘어설 ... **기대치를 하회**할 ... **파운드리 부문을 주목** (맥락 유지됨)
     - 품사 규칙 유연화: 단순 수식어(매우, 크게)는 배제하되, 문장의 방향성을 결정하는 핵심 동사/행위(돌파, 하회, 매도, 흑자전환)는 반드시 주체/수치와 묶어서 구절 형태로 함께 강조하라.
     - 조사 포함 허용: 자연스러운 문맥 압축을 위해 "기대치를 하회"처럼 조사가 포함된 구절 통째로 강조하는 것을 허용한다. 단, 문장 전체를 너무 길게 강조하는 것은 금지한다.
  7. 어법 단순화(명확성): 경제/금융 전문 용어는 보존하되, 현학적/추상적인 표현은 배제하고 단문 위주로 서술하라.
  
  뉴스 목록:
  ${newsItems.map((n, i) => `[인덱스: ${i}] 제목: ${n.title}\n미리보기: ${n.description}`).join('\n\n')}
  
  [출력 형식 (반드시 JSON 객체로 응답, 모든 필드 필수 포함)]
  {
    "summary": "구조화된 핵심 요약 (반드시 3~4개의 불릿 포인트로만 압축할 것)\\n- 핵심 요약 1\\n- 핵심 요약 2\\n- 핵심 요약 3",
    "industry": "코스피 전기전자",
    "selectedNews": [
      {
        "index": 0,
        "newTitle": "기사 내용을 드러내는 짧고 깔끔한 요약 제목 (⚠️ 원본 제목 앞의 [언론사] 태그를 반드시 유지하되, [mar]처럼 영문이거나 4글자 이상이라면 반드시 [마켓인], [매일경] 등 '한글 3글자'로 번역/축약하여 통일할 것. 제목 끝에 날짜 추가 절대 금지)",
        "articleSummary": "해당 개별 기사에 대한 요약 (반드시 제공된 '미리보기' 내용 내에서만 팩트 기반으로 2~3문장 작성)"
      }
    ]
  }
  `;
  let result = await callGemini(prompt, true);
  
  // Validation: 하이라이트 누락 재시도 로직 (클로봇 사태 방지)
  if (result && result.summary && !result.summary.includes('**')) {
    console.log(`[Validation] ${stockName} 하이라이트 누락 감지. 재시도 중...`);
    const retryPrompt = prompt + "\n\n⚠️ 경고: 방금 전 응답에서 마크다운(**) 하이라이트가 완전히 누락되었습니다. 반드시 각 문장마다 핵심 명사에 **단어** 형태로 하이라이트를 넣어 다시 출력하세요.";
    result = await callGemini(retryPrompt, true);
  }
  
  // Layer 3 출력 렌더러 - 뱃지 판별 로직
  const categorizeNews = (stats, title) => {
    let isSudden = false;
    let isMostViewed = false;

    if (stats) {
      if (stats.anomalyScore >= 30) isSudden = true;
      if (stats.clusterScore >= 20 && stats.anomalyScore < 30) isMostViewed = true;
    }
    
    // 1. 급등(sudden) 폴백: 키워드 기반 (경고, 특징주, 상한가 등 확대)
    if (!isSudden && /단독|최초|돌연|갑자기|급등|급락|신규|깜짝|속보|최고|최저|경고|상한가|하한가|돌파|폭등|폭락|수주|계약|흑자|특징주/.test(title)) {
      isSudden = true;
    }
    
    // 2. 주목(most_viewed) 폴백: 캐시가 비어있어도 현재 15개 배치 안에서 겹치는 주제가 2개 이상이면 부여
    if (!isSudden && !isMostViewed) {
      let localMatchCount = 0;
      const words = title.split(/\s+/).filter(w => w.length >= 2).map(w => w.replace(/[^가-힣a-zA-Z0-9]/g, ''));
      for (const n of newsItems) {
        if (n.title === title) continue;
        if (words.filter(w => n.title.includes(w)).length >= 2) localMatchCount++;
      }
      if (localMatchCount >= 1) isMostViewed = true; // 기준 완화: 종목명 외에 1단어만 더 겹쳐도 주목 부여
    }

    if (isSudden) return 'sudden'; // 급등
    if (isMostViewed) return 'most_viewed'; // 주목
    return 'normal'; // 회색(일반)
  };

  const selectedNews = (result.selectedNews || []).map(item => {
    const newsItem = newsItems[item.index];
    if (!newsItem) return null;
    
    let cleanTitle = item.newTitle ? item.newTitle.replace(/\[★우선선택\]\s*/g, '') : newsItem.title.replace(/\[★우선선택\]\s*/g, '');
    
    // AI가 자의적으로 붙인 일련번호(예: "1. ", "2. ") 강제 제거
    cleanTitle = cleanTitle.replace(/^\d+\.\s*/, '');

    // 언론사 이름 3글자 강제 컷팅 (할루시네이션 방지용 코드레벨 방어)
    cleanTitle = cleanTitle.replace(/^\[([^\]]+)\]/, (match, p1) => {
      let pub = p1.trim();
      if (pub.toLowerCase().includes('market in') || pub.toLowerCase() === 'mar') pub = '마켓인';
      else if (pub.toLowerCase().includes('news1') || pub.toLowerCase() === 'new') pub = '뉴스1';
      else if (pub.toLowerCase().includes('sr타')) pub = 'SR타';
      else if (pub.toLowerCase().includes('zdnet')) pub = '지디넷';
      return '[' + pub.substring(0, 3) + ']';
    });

    if (newsItem.pubDate && !cleanTitle.includes(newsItem.pubDate)) {
      cleanTitle += ` (${newsItem.pubDate})`;
    }

    const determinedCategory = categorizeNews(newsItem.stats, cleanTitle);

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
    const historyData = validCloses.slice(-22);
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
      history: historyData,
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
    [주의 사항 및 할루시네이션 방지 규칙]
    1. 오직 '외국인 코스피200 선물'에 대한 수치만 추출하라. 개인/기관, 현물 매매, 코스닥 선물 등 다른 주체의 데이터는 철저히 배제하라.
    2. 절대 임의의 수치를 상상해서 지어내지 말고, 기사 제목에 명시된 수치만 정확히 추출하라. 기사 제목에 명확한 수치가 없다면 방향성이나 규모를 추측하지 말고 무조건 '알 수 없음'으로 처리하라.
    
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
  
  const cache = loadCache();
  housekeeping(cache);
  
  const majorNames = MAJOR_STOCKS.map(s => s.name);
  const krxCodes = await fetchAllKRXCodes();

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
  당신은 객관적이고 팩트에 기반한 시황 분석가입니다.
  수집된 국내외 주요 언론사들의 시황 분석 기사들을 종합하여, 오늘 글로벌 거시 경제와 증시 전반의 흐름을 요약하십시오.
  
  [작성 지침 및 할루시네이션 방지 규칙]
  1. "최근 글로벌 증시는..." 같은 뻔하고 영양가 없는 서론은 절대 사용하지 마라.
  2. 단순 사실이나 지표를 앵무새처럼 나열하지 말고, 의미 있는 정보만 요약하라.
  3. Market Direction: 제공된 기사들에서 공통적으로 시사하는 방향성(상승/하락/보합/섹터차별화 등)을 도출하라. 기사에 명시되지 않은 애널리스트 수준의 임의 예측, 과장, 창작은 엄격히 금지한다.
  4. 어머님이 모바일에서 읽기 편하도록, 한 가지 주제나 흐름이 끝날 때마다 반드시 줄바꿈(\\n\\n)을 두 번씩 넣어서 3~4개의 굵직한 문단으로 구성하라.
  5. ⚠️ 할루시네이션 철저 배제: 제공된 뉴스 데이터와 실제 지표에 입각해서만 서술하라. 이해를 돕겠다는 목적으로 뉴스 데이터에 없는 비유, 부연 설명, 뇌피셜(할루시네이션)을 절대 덧붙이지 마라.
  6. 어법 단순화(명확성): 경제/금융 전문 용어는 보존하되, 현학적이거나 추상적인 표현은 배제하라. 문장의 길이를 짧게 끊어 쓰는 '단문' 위주로 서술하라.
  
  [⭐특수 기능 지시사항 (가장 중요)⭐]
  생성한 요약 텍스트 안에서 가장 핵심이 되는 중요한 단어나 어구(키워드) 3~5개를 선정해.
  각 키워드에 대해, 그 배경이 된 원본 뉴스의 '한국어 요약본(2문장 내외)'과 해당 뉴스의 인덱스 번호(newsIndex)를 매핑해서 JSON 형식으로 출력해.
  ⚠️ 주의: "word" 필드의 값은 반드시 "summaryText" 문장 안에 존재하는 정확히 일치하는 부분 문자열이어야 한다. (오탈자나 임의 변형 시 매핑 실패함)
  
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
  너는 팩트 기반의 글로벌 투자 전략가야.
  현재 나의 주요 투자 종목은 [${majorNames.join(', ')}] 이야.
  아래 **미국 GICS 11대 주요 섹터(정보기술, 임의소비재, 산업재, 커뮤니케이션 서비스, 헬스케어, 소재, 금융, 에너지, 유틸리티, 필수소비재, 부동산)** 중에서 총 4개의 섹터를 선정하여 분석하라.
  
  [섹터 선정 기준]
  - 고정 섹터 3개: 나의 주요 종목([${majorNames.join(', ')}])들의 사업 영역을 분석하여 가장 직결되는 핵심 섹터 3개를 선정하라.
  - 핫이슈 섹터 1개: 위에서 선정된 3개의 섹터를 제외한 나머지 섹터 중에서, 간밤 미국 시장에서 가장 유의미한 움직임이나 큰 뉴스가 있었던 섹터 딱 1개를 추가하라.

  [분석 지침 및 할루시네이션 방지 규칙]
  1. 섹터 선정: 반드시 위에서 제시된 11대 GICS 섹터명 목록에서만 총 4개를 선택해 그대로 사용하라. (예: "정보기술(IT)" 등 임의 변형 금지. 오직 "정보기술" 만 사용)
  2. overnightTrend: 아래 [미국장 뉴스]를 중심으로 해당 섹터의 주요 이슈를 서술. 비즈니스 맥락과 뉴스 위주로 3~4문장 요약. (기사에 없는 과장된 수치나 인과관계를 창작하지 마라)
  3. historicalImpact: 이 미국 섹터의 간밤 흐름이 나의 한국 주요 종목에 오늘 어떤 영향을 미칠지 서술. (⚠️ 절대 기사나 데이터에 명시되지 않은 구체적인 상승/하락 퍼센트(%)나 수치를 지어내지 마라. 논리적 상관관계 위주로만 서술하라)
  4. outlook: 오늘 한국 시장 개장 시 해당 섹터 및 테마에 대한 전반적 전망 2~3문장. (기사에 나타난 월가 전문가나 시장의 지배적 의견만을 요약하며, AI의 독자적 예측은 엄격히 금지한다)
  5. keywords: 핵심 키워드 3~5개. (⚠️ 반드시 네가 위에서 작성한 문장 안에 존재하는 텍스트와 100% 동일해야 하며, 조사나 서술어를 제외한 핵심 명사(예: "산업재", "캐터필러", "전력", "드론")만 짧은 단어 단위로 뽑아내야 한다. 띄어쓰기가 있는 구절 전체를 통째로 추출하지 마라.)
  6. usPeers: 해당 섹터에 속하는 미국 대장주를 반드시 아래 [미국장 대장주 목록]에서 골라 배열로 나열하라. 종목명 뒤의 괄호 안 섹터 힌트를 참고하여 매핑하며, 원문 문자열 그대로(괄호 포함) 반환하라. (예: "엔비디아"가 아니라 "엔비디아(AI반도체)" 처럼 100% 동일하게 작성할 것. 임의 축약 시 매핑 실패함). 해당되는 것이 없다면 빈 배열 []을 반환하라.

  [미국장 대장주 목록 및 간밤 등락률]
  ${peerChangeLine}

  [미국장 뉴스]
  ${rawYahooNews.map(n=>`[${n.ticker}] ${n.title}\n미리보기: ${n.description}`).join("\n\n").substring(0, 10000)}

  [출력 형식 - 반드시 JSON 객체로 응답]
  {
    "sectors": [
      {
        "weather": "☀️ 맑음 OR ⛅ 구름 OR 🌧️ 흐림 OR ⛈️ 폭풍",
        "sectorName": "GICS 11대 섹터명 중 하나와 100% 일치하는 문자열",
        "usPeers": ["엔비디아", "AMD", "TSMC"],
        "overnightTrend": "간밤 동향 3~4문장 (반드시 실제 등락률 포함)...",
        "historicalImpact": "한국 주요 종목에 미치는 영향 2~3문장...",
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
  앞서 분석한 4개의 핵심 섹터는 다음과 같아: [ ${(sectorSummary.sectors || []).map(s => `"${s.sectorName}"`).join(', ')} ].

  [지시사항 및 할루시네이션 방지 규칙]
  1. 앞서 분석한 4개의 핵심 섹터 각각에 대해, 아래 제공된 [뉴스 목록]에서 가장 중요하고 임팩트 있는 기사를 딱 3개씩 선별해라. (총 12개)
  2. ⚠️ 종목 다양성 규칙: 한 섹터 내에서 선별하는 3개의 기사가 한 기업에만 쏠리지 않도록 하라. 한 종목(기업)에 대한 기사는 **최대 2개까지만 허용**하며, 가급적 3개 모두 서로 다른 기업이나 다른 관점의 이슈를 다루는 유니크한 기사로 구성하라.
  3. 선별된 12개 기사에 대해, '제목(title)'과 '핵심 요약(articleSummary)'을 한국어로 완벽하고 자연스럽게 번역해라.
     - 💡 [제목 번역 규칙]: 원문을 그대로 직역하여 어색하게 두 문장으로 쪼개거나 같은 단어(예: 연도, 종목명)를 중복해서 쓰지 마라. 핵심만 담아 하나의 간결하고 매끄러운 문장(또는 명사형)으로 세련되게 다듬어라.
  4. ⚠️ 할루시네이션 방지: 반드시 제공된 [뉴스 목록]의 미리보기(description) 텍스트만을 바탕으로 번역 및 요약해야 한다. 텍스트가 중간에 '...'으로 잘려있을 경우, 끊긴 부분까지만 의미를 살려 요약하고 절대 뒷부분의 내용을 임의로 상상하거나 창작하지 마라.
  5. ⚠️ 섹터명 맵핑 규칙: JSON 반환 시 'sectorName'은 위에서 제시된 4개의 핵심 섹터명 배열 중 하나와 토씨 하나 틀리지 않고 100% 동일한 문자열로 적어야 한다. (공백 포함 여부 확인 필수, 다르면 뉴스 매핑 누락됨)

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

  // 섹션 3: 주요 종목
  console.log("Processing Section 3: Major Stocks...");
  for (const stock of MAJOR_STOCKS) {
    const top15News = await processLayer1(stock.name, cache);
    const aiResult = await summarizeStock(stock.name, top15News, 5);
    
    const code = krxCodes[stock.name] || krxCodes[stock.name + '우'] || null;
    let volume = 0, marketCap = 0;
    if (code) {
      const pollingData = await fetchNaverPollingData(code);
      volume = pollingData.volume;
      marketCap = pollingData.marketCap;
    }
    
    report.section3_major.push({ 
      ...stock, 
      summary: aiResult.summary, 
      industry: aiResult.industry, 
      news: aiResult.news,
      volume,
      marketCap
    });
    await sleep(1500); // API Rate Limit 방지용 휴식
  }
  
  // Sorting section3_major by combined score
  const vols = report.section3_major.map(s => s.volume);
  const caps = report.section3_major.map(s => s.marketCap);
  const maxVol = Math.max(...vols, 1);
  const maxCap = Math.max(...caps, 1);
  
  report.section3_major.forEach(s => {
    const normVol = (s.volume / maxVol) * 100;
    const normCap = (s.marketCap / maxCap) * 100;
    s.combinedScore = (normVol * 0.5) + (normCap * 0.5);
  });
  
  report.section3_major.sort((a, b) => b.combinedScore - a.combinedScore);

  // 섹션 4: 관심 종목
  console.log("Processing Section 4: Interest Stocks...");
  for (const stock of INTEREST_STOCKS) {
    const top15News = await processLayer1(stock.name, cache);
    const aiResult = await summarizeStock(stock.name, top15News, 5);
    report.section4_interest.push({ ...stock, summary: aiResult.summary, industry: aiResult.industry, news: aiResult.news });
    await sleep(1500); // API Rate Limit 방지용 휴식
  }

  // 섹션 5: 관망 종목 (슬립모드 해제 로직 임시 구현)
  console.log("Processing Section 5: Watchlist Stocks...");
  for (const stock of ARCHIVED_STOCKS) {
    // 임시 로직: 일단 빈 칸으로 구성
  }
  
  // 파이프라인 마지막 단계: 캐시 저장 (news_cache.json)
  saveCache(cache);

  const outPath = path.join(process.cwd(), 'src', 'data', 'latest_report.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8"); } catch(err) { console.error("FATAL ERROR:", err); const outPath = path.join(process.cwd(), "src", "data", "deepseek_report.json"); fs.writeFileSync(outPath, JSON.stringify({date: new Date().toISOString(), section1: {summary: "ERROR: " + err.message + " " + err.stack}})); process.exit(0); } } main();









