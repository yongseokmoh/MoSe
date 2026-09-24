import fs from 'fs';
import path from 'path';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const profilePath = path.join(process.cwd(), 'src', 'data', 'user_profile.json');
const userProfile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
// (구) 관심종목(archived)은 제외하고 API 호출 대상에 포함시킴
const STOCKS = userProfile.stocks.filter(s => s.type !== 'archived');
const MAJOR_STOCKS = STOCKS.filter(s => s.type === 'major').map(s => s.name);

// 구글 뉴스 수집 (검색어 고도화)
async function fetchGoogleNews(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
  const response = await fetch(url);
  const text = await response.text();
  const items = [];
  const itemRegex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<\/item>/g;
  let match;
  while ((match = itemRegex.exec(text)) !== null && items.length < 5) {
    items.push({ 
      title: match[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/&quot;/g, '"'), 
      link: match[2] 
    });
  }
  return items;
}

// 미국 증시 매크로 요약 (주요 종목 섹터 기반)
async function generateMacroSummary() {
  const macroNews = await fetchGoogleNews("미국 증시 마감 OR 뉴욕 증시 특징주");
  
  if (!GEMINI_API_KEY) return "미국 증시 요약 데이터가 없습니다. (API 키 필요)";

  const prompt = `
  너는 증권 애널리스트야. 현재 나의 주요 투자 종목들은 다음과 같아: [${MAJOR_STOCKS.join(', ')}].
  이 종목들이 속한 주요 섹터(예: 반도체, 자동차, 로봇 등)를 파악해줘.
  
  그리고 다음의 '미국 증시 뉴스'를 바탕으로, 간밤에 뉴욕 증시에서 해당 주요 섹터와 연관된 미국 대표주(예: 엔비디아, 테슬라 등)들의 주가 변동 상황과 뉴스를 중점적으로 분석해서 국내 장에 미칠 영향을 딱 3문장으로 요약해줘.
  
  [미국 증시 뉴스]:
  ${macroNews.map(n => n.title).join('\n')}
  `;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const data = await res.json();
    return data.candidates[0].content.parts[0].text;
  } catch (e) {
    return "미국 증시 요약을 생성하지 못했습니다.";
  }
}

// 개별 종목 요약 (애널리스트 리포트, 장외/전일 뉴스 중점)
async function summarizeWithGemini(newsItems, stockName) {
  if (!GEMINI_API_KEY) {
    return { summary: "더미 데이터", topNews: newsItems.slice(0, 3) };
  }

  const prompt = `
  다음은 '${stockName}'에 대한 최신 뉴스 헤드라인들이야.
  이 뉴스들을 바탕으로 오늘 하루 주가 흐름과 투자 포인트 3문장으로 요약해줘.
  
  [특별 지시사항]:
  - 뉴스 중에 '애널리스트 리포트(목표가 상향/하향)', '실적 발표', '장외/시간외 거래 변동'과 관련된 내용이 있다면 반드시 포함해서 요약해.
  - 그런 특별한 내용이 없다면 일반적인 호재/악재를 요약해.
  
  뉴스 목록:
  ${newsItems.map((n, i) => `${i+1}. ${n.title}`).join('\n')}
  
  출력 형식 (반드시 JSON 형식으로만 응답할 것):
  {
    "summary": "3문장 요약 내용",
    "topNewsIndex": [0, 1, 2]
  }
  `;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });
    const data = await response.json();
    const parsed = JSON.parse(data.candidates[0].content.parts[0].text);
    return { summary: parsed.summary, topNews: parsed.topNewsIndex.map(idx => newsItems[idx]).filter(Boolean) };
  } catch (e) {
    return { summary: "요약 오류 발생", topNews: newsItems.slice(0, 3) };
  }
}

async function main() {
  console.log("🚀 Daily News Batch Started...");
  
  // 1. 매크로(미국장) 요약 생성
  console.log("Generating Macro/US Market Summary based on major sectors...");
  const macroSummary = await generateMacroSummary();

  const report = {
    date: new Date().toISOString(),
    market: {
      nasdaq: "자동업데이트 (예정)",
      kospi: "자동업데이트 (예정)",
      exchangeRate: "자동업데이트 (예정)",
      oil: "자동업데이트 (예정)",
      aiSummary: macroSummary
    },
    stocks: []
  };

  // 2. 개별 종목 요약 (archived 제외)
  for (const stock of STOCKS) {
    console.log(`Processing ${stock.name}...`);
    // 검색어에 리포트, 목표가, 실적, 특징주 등 키워드를 추가하여 고품질 뉴스 우선 수집
    const query = `${stock.name} 주식 (특징주 OR 리포트 OR 실적 OR 목표가 OR 장외)`;
    const news = await fetchGoogleNews(query);
    const aiResult = await summarizeWithGemini(news, stock.name);
    
    report.stocks.push({
      id: stock.code || Math.random().toString(),
      name: stock.name,
      type: stock.type,
      currentPrice: "장전", 
      summary: aiResult.summary,
      news: aiResult.topNews
    });
    
    await new Promise(r => setTimeout(r, 3000));
  }

  const outPath = path.join(process.cwd(), 'src', 'data', 'latest_report.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`✅ Report generated at ${outPath}`);
}

main();
