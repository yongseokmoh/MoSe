import fs from 'fs';
import path from 'path';

// GitHub Secrets에서 주입될 Gemini API 키
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// 어머님의 주요 종목 및 관심 종목 리스트 (추후 외부 설정 파일로 분리 가능)
const STOCKS = [
  { name: '삼성전자', code: '005930', type: 'major' },
  { name: 'SK하이닉스', code: '000660', type: 'major' },
  { name: '현대차', code: '005380', type: 'interest' }
];

// 구글 뉴스 RSS를 활용한 종목별 최신 기사 수집 (가볍고 빠르며 무료)
async function fetchGoogleNews(stockName) {
  const query = encodeURIComponent(`${stockName} 주식 OR 주가`);
  const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=ko&gl=KR&ceid=KR:ko`;
  
  const response = await fetch(rssUrl);
  const text = await response.text();
  
  const items = [];
  // 외부 라이브러리(rss-parser) 없이 정규식으로 가볍게 파싱
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

// Gemini API를 호출하여 뉴스 3줄 요약 및 핵심 기사 추출
async function summarizeWithGemini(newsItems, stockName) {
  if (!GEMINI_API_KEY) {
    console.warn(`[경고] GEMINI_API_KEY가 없습니다. ${stockName} 더미 데이터를 반환합니다.`);
    return {
      summary: `${stockName}에 대한 AI 요약입니다. (API 키가 설정되지 않아 임시 텍스트가 노출됩니다.)`,
      topNews: newsItems.slice(0, 3)
    };
  }

  const prompt = `
  너는 어르신을 위한 친절한 수석 증권 애널리스트야. 다음은 '${stockName}'에 대한 오늘 아침 주요 뉴스 헤드라인들이야.
  이 뉴스들을 바탕으로 오늘 하루 주가 흐름과 투자자들이 주목해야 할 핵심 포인트를 딱 3문장으로 이해하기 쉽게 요약해줘.
  어려운 전문 용어는 피하고, 숫자나 팩트를 지어내지 마.
  
  뉴스 목록:
  ${newsItems.map((n, i) => `${i+1}. ${n.title}`).join('\n')}
  
  출력 형식 (반드시 JSON 형식으로만 응답할 것):
  {
    "summary": "3문장 요약 내용",
    "topNewsIndex": [0, 1, 2] // 가장 중요하다고 생각하는 핵심 뉴스 인덱스 번호 3개 (0부터 시작)
  }
  `;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" } // Gemini 1.5 JSON 강제 모드
      })
    });
    
    const data = await response.json();
    const resultText = data.candidates[0].content.parts[0].text;
    const parsed = JSON.parse(resultText);
    
    return {
      summary: parsed.summary,
      topNews: parsed.topNewsIndex.map(idx => newsItems[idx]).filter(Boolean)
    };
  } catch (e) {
    console.error(`Gemini API 호출 실패 (${stockName}):`, e);
    return { summary: "요약 생성 중 오류가 발생했습니다.", topNews: newsItems.slice(0, 3) };
  }
}

async function main() {
  console.log("🚀 Daily News Generation Batch Started...");
  
  const report = {
    date: new Date().toISOString(),
    market: {
      nasdaq: "+1.2% (더미)", // 추후 Yahoo Finance 연동
      kospi: "+0.5% (더미)",
      exchangeRate: "1,350원",
      oil: "$75.00",
      aiSummary: "미국 증시는 빅테크 실적 호조로 상승 마감했습니다. 국내 반도체 섹터의 강세가 예상됩니다."
    },
    stocks: []
  };

  for (const stock of STOCKS) {
    console.log(`Processing ${stock.name}...`);
    const news = await fetchGoogleNews(stock.name);
    const aiResult = await summarizeWithGemini(news, stock.name);
    
    report.stocks.push({
      id: stock.code,
      name: stock.name,
      type: stock.type,
      currentPrice: "업데이트 예정", 
      summary: aiResult.summary,
      news: aiResult.topNews
    });
    
    // 무료 티어 RPM(분당 요청 수) 제한을 피하기 위해 3초 대기
    await new Promise(r => setTimeout(r, 3000));
  }

  // Next.js 앱이 렌더링할 때 읽어갈 수 있도록 src/data 경로에 JSON 저장
  const outPath = path.join(process.cwd(), 'src', 'data', 'latest_report.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`✅ Report successfully generated at ${outPath}`);
}

main();
