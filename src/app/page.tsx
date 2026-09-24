import AccordionNews from '@/components/AccordionNews';
import fs from 'fs';
import path from 'path';
import Link from 'next/link';

// 서버에서 JSON 파일을 읽어오는 함수
function getReportData() {
  try {
    const filePath = path.join(process.cwd(), 'src', 'data', 'latest_report.json');
    const fileContents = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(fileContents);
  } catch (error) {
    console.error("데이터 파일을 읽을 수 없습니다:", error);
    return null;
  }
}

export default function Home() {
  const report = getReportData();

  // 날짜 포맷팅 함수
  const formatDate = (isoString: string) => {
    if (!isoString) return '업데이트 대기중';
    const date = new Date(isoString);
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 리포트`;
  };

  if (!report) {
    return <div className="p-10 text-center">데이터를 불러오는 중입니다...</div>;
  }

  // 종목 분류 (주요종목, 관심종목 등)
  const majorStocks = report.stocks.filter((s: any) => s.type === 'major');
  const interestStocks = report.stocks.filter((s: any) => s.type === 'interest');

  return (
    <div className="min-h-screen bg-[var(--muted)]/20 max-w-[600px] mx-auto shadow-xl relative pb-20 overflow-x-hidden">
      
      {/* Top Navigation */}
      <div className="flex justify-between items-center px-5 py-4 border-b border-[var(--border)] bg-[var(--background)] sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
           <span className="text-xl cursor-pointer">☰</span>
           <span className="font-extrabold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-indigo-500">MoSe News</span>
        </div>
        <div className="flex gap-4 text-xl">
          <Link href="/archive" className="cursor-pointer" title="보관함">💾</Link>
          <Link href="/settings" className="cursor-pointer" title="종목 설정">⚙️</Link>
        </div>
      </div>

      <div className="px-4 py-5 space-y-6">
        
        <div className="text-sm font-bold text-[var(--foreground)] px-1 flex items-center gap-2">
          📅 {formatDate(report.date)}
        </div>

        {/* Section 1: Market */}
        <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm">
          <h3 className="font-bold text-sm mb-3">거시/증시 요약</h3>
          <div className="grid grid-cols-2 gap-2 text-xs mb-3 font-medium">
            <div className="bg-[var(--muted)]/60 p-2.5 rounded-xl flex justify-between">
              <span>🇺🇸 나스닥</span> <span className="text-red-500">{report.market.nasdaq}</span>
            </div>
            <div className="bg-[var(--muted)]/60 p-2.5 rounded-xl flex justify-between">
              <span>🇰🇷 코스피</span> <span className="text-red-500">{report.market.kospi}</span>
            </div>
            <div className="bg-[var(--muted)]/60 p-2.5 rounded-xl flex justify-between">
              <span>💱 환율</span> <span>{report.market.exchangeRate}</span>
            </div>
            <div className="bg-[var(--muted)]/60 p-2.5 rounded-xl flex justify-between">
              <span>🛢️ 유가</span> <span>{report.market.oil}</span>
            </div>
          </div>
          <p className="text-xs text-[var(--muted-foreground)] leading-relaxed bg-[var(--background)] p-3 rounded-xl border border-[var(--border)]/50">
            <span className="text-[var(--primary)] font-bold mb-1 block">🤖 AI 증시 요약</span> 
            {report.market.aiSummary}
          </p>
        </section>

        {/* Section 3: Major Stocks */}
        {majorStocks.map((stock: any) => (
          <section key={stock.id} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm border-l-4 border-l-[var(--primary)]">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-base">{stock.name} <span className="text-xs text-[var(--muted-foreground)] font-normal ml-1">주요종목</span></h3>
              <span className="text-sm text-red-500 font-bold">{stock.currentPrice}</span>
            </div>
            
            {/* AI Summary as first item */}
            <div className="bg-[var(--muted)]/30 p-3 rounded-xl mb-3 text-[13px] text-[var(--foreground)] leading-relaxed">
               <strong className="text-[var(--primary)] block mb-1">🤖 종목 AI 요약</strong>
               {stock.summary}
            </div>

            {/* News List */}
            {stock.news.map((newsItem: any, index: number) => (
              <AccordionNews 
                key={index} 
                news={{
                  id: `${stock.id}-${index}`,
                  title: `${index + 1}. ${newsItem.title}`,
                  summary: '상세 기사 원문 링크 연결', // 향후 원문 크롤링 시 확장
                  content: newsItem.link
                }} 
              />
            ))}
          </section>
        ))}

        {/* Section 4: Interest Stocks */}
        {interestStocks.length > 0 && (
          <div className="pt-2 border-t border-[var(--border)] border-dashed">
            <h2 className="font-bold text-[var(--muted-foreground)] px-1 mb-4 text-sm">👀 나의 관심 종목</h2>
            {interestStocks.map((stock: any) => (
              <section key={stock.id} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm mb-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold text-base text-[var(--primary)]">{stock.name}</h3>
                </div>
                <div className="bg-[var(--muted)]/30 p-3 rounded-xl mb-3 text-[13px] text-[var(--foreground)] leading-relaxed">
                   {stock.summary}
                </div>
              </section>
            ))}
          </div>
        )}
        
        <div className="pb-6 pt-4 text-center text-xs text-[var(--muted-foreground)]">
          끝까지 다 읽으셨습니다! 수고하셨습니다.
        </div>

      </div>
    </div>
  );
}
