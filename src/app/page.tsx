import AccordionNews from '@/components/AccordionNews';
import fs from 'fs';
import path from 'path';
import Link from 'next/link';

function getReportData() {
  try {
    const filePath = path.join(process.cwd(), 'src', 'data', 'latest_report.json');
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return null;
  }
}

export default function Home() {
  const report = getReportData();

  const formatDate = (isoString: string) => {
    if (!isoString) return '업데이트 대기중';
    const date = new Date(isoString);
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 리포트`;
  };

  // 구형 JSON 하위 호환을 위한 안전장치
  const s1 = report?.section1 || report?.market || {};
  const s2 = report?.section2 || { summary: "데이터 생성 중..." };
  const major = report?.section3_major || report?.stocks?.filter((s:any)=>s.type==='major') || [];
  const interest = report?.section4_interest || report?.stocks?.filter((s:any)=>s.type==='interest') || [];
  const watchlist = report?.section5_watchlist || [];

  return (
    <div className="min-h-screen bg-[var(--muted)]/20 max-w-[600px] mx-auto shadow-xl relative pb-20 overflow-x-hidden">
      
      {/* Top Nav */}
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
          📅 {formatDate(report?.date)}
        </div>

        {/* Section 1: 거시/증시 정보 */}
        <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm">
          <h2 className="font-bold text-base mb-3 text-[var(--primary)]">섹션 1: 거시 및 글로벌 지수</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[13px] mb-4 font-bold tracking-tight">
            <div className="bg-[var(--muted)]/60 p-3 rounded-xl flex flex-col justify-center">
              <span className="text-[var(--muted-foreground)] text-[10px] mb-0.5">🇺🇸 S&P 500</span>
              <span className={s1.sp500?.includes('-') ? 'text-blue-500' : 'text-red-500'}>{s1.sp500 || '대기중'}</span>
            </div>
            <div className="bg-[var(--muted)]/60 p-3 rounded-xl flex flex-col justify-center">
              <span className="text-[var(--muted-foreground)] text-[10px] mb-0.5">🇺🇸 나스닥</span>
              <span className={s1.nasdaq?.includes('-') ? 'text-blue-500' : 'text-red-500'}>{s1.nasdaq || '대기중'}</span>
            </div>
            <div className="bg-[var(--muted)]/60 p-3 rounded-xl flex flex-col justify-center border border-[var(--primary)]/20 shadow-inner">
              <span className="text-[var(--muted-foreground)] text-[10px] mb-0.5 font-extrabold">🇺🇸 필라델피아 반도체</span>
              <span className={s1.sox?.includes('-') ? 'text-blue-500' : 'text-red-500'}>{s1.sox || '대기중'}</span>
            </div>
            <div className="bg-[var(--muted)]/60 p-3 rounded-xl flex flex-col justify-center">
              <span className="text-[var(--muted-foreground)] text-[10px] mb-0.5">🇰🇷 코스피</span>
              <span className={s1.kospi?.includes('-') ? 'text-blue-500' : 'text-red-500'}>{s1.kospi || '대기중'}</span>
            </div>
            <div className="bg-[var(--muted)]/60 p-3 rounded-xl flex flex-col justify-center">
              <span className="text-[var(--muted-foreground)] text-[10px] mb-0.5">🇰🇷 코스닥</span>
              <span className={s1.kosdaq?.includes('-') ? 'text-blue-500' : 'text-red-500'}>{s1.kosdaq || '대기중'}</span>
            </div>
            <div className="bg-[var(--muted)]/60 p-3 rounded-xl flex flex-col justify-center">
              <span className="text-[var(--muted-foreground)] text-[10px] mb-0.5">💱 원/달러 환율</span>
              <span className={s1.exchangeRate?.includes('-') ? 'text-blue-500' : 'text-red-500'}>{s1.exchangeRate || '대기중'}</span>
            </div>
          </div>
          <p className="text-[13px] text-[var(--foreground)] leading-relaxed bg-[var(--background)] p-3 rounded-xl border border-[var(--border)]/50">
            {s1.summary || s1.aiSummary || '요약 데이터가 없습니다.'}
          </p>
        </section>

        {/* Section 2: 선행 정보 (미국 증시 주요 섹터 변화) */}
        <section className="bg-gradient-to-br from-[var(--primary)]/10 to-[var(--background)] border border-[var(--primary)]/20 rounded-2xl p-4 shadow-sm">
          <h2 className="font-bold text-base mb-3 text-[var(--primary)]">섹션 2: 선행 정보 (내 종목 맞춤 미국 섹터)</h2>
          <p className="text-[13px] text-[var(--foreground)] leading-relaxed font-medium">
            {s2.summary}
          </p>
        </section>

        {/* Section 3: 주요 종목 */}
        <div>
          <h2 className="font-bold text-base px-1 mb-3">섹션 3: 주요 종목 <span className="text-xs font-normal text-[var(--muted-foreground)]">(리포트/장외거래 포함)</span></h2>
          {major.length > 0 ? major.map((stock: any) => (
            <section key={stock.id || stock.name} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm mb-4 border-l-4 border-l-blue-500">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-[15px]">{stock.name}</h3>
                <span className="text-sm font-bold text-[var(--muted-foreground)]">{stock.currentPrice}</span>
              </div>
              <div className="bg-[var(--muted)]/30 p-3 rounded-xl mb-3 text-[13px] leading-relaxed">
                 <strong className="text-blue-500 block mb-1">🤖 AI 분석</strong>
                 {stock.summary}
              </div>
              {stock.news?.map((newsItem: any, index: number) => (
                <AccordionNews key={index} news={{ id: `${stock.name}-${index}`, title: `${index + 1}. ${newsItem.title}`, content: newsItem.link }} />
              ))}
            </section>
          )) : <p className="text-xs text-[var(--muted-foreground)] px-2">등록된 주요 종목이 없습니다.</p>}
        </div>

        {/* Section 4: 관심 종목 */}
        <div>
          <h2 className="font-bold text-base px-1 mb-3">섹션 4: 관심 종목</h2>
          {interest.length > 0 ? interest.map((stock: any) => (
            <section key={stock.id || stock.name} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm mb-4 border-l-4 border-l-gray-400">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-[15px]">{stock.name}</h3>
                <span className="text-sm font-bold text-[var(--muted-foreground)]">{stock.currentPrice}</span>
              </div>
              <div className="bg-[var(--muted)]/30 p-3 rounded-xl mb-3 text-[13px] leading-relaxed">
                 {stock.summary}
              </div>
              {stock.news?.map((newsItem: any, index: number) => (
                <AccordionNews key={index} news={{ id: `${stock.name}-${index}`, title: `${index + 1}. ${newsItem.title}`, content: newsItem.link }} />
              ))}
            </section>
          )) : <p className="text-xs text-[var(--muted-foreground)] px-2">등록된 관심 종목이 없습니다.</p>}
        </div>

        {/* Section 5: 관망 종목 (슬립모드 해제) */}
        <section className="bg-[var(--background)] border border-[var(--border)] border-dashed rounded-2xl p-4 opacity-80">
          <h2 className="font-bold text-base mb-2 text-[var(--muted-foreground)]">섹션 5: 관망 종목 (슬립모드 해제)</h2>
          {watchlist.length > 0 ? (
            watchlist.map((stock:any) => <div key={stock.name}>{stock.name} 깨어남!</div>)
          ) : (
            <p className="text-xs text-[var(--muted-foreground)] leading-relaxed mt-2">
              현재 관망 종목((구) 관심종목) 중 뉴스량이 폭증하여 슬립모드가 해제된 종목이 없습니다. 알고리즘 연동 대기 중입니다.
            </p>
          )}
        </section>

      </div>
    </div>
  );
}
