export const dynamic = 'force-dynamic';
import AccordionNews from '@/components/AccordionNews';
import MacroSummaryClient from '@/components/MacroSummaryClient';
import fs from 'fs';
import path from 'path';
import Link from 'next/link';
import { USFlag, KRFlag } from '@/components/Flags';

// 미니 차트 (Sparkline) 컴포넌트 - 크기 확대
const Sparkline = ({ data, isPositive }: { data: number[], isPositive: boolean }) => {
  if (!data || data.length < 2) return <div className="w-[60px] h-[24px]"></div>;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 60;
  const height = 24;
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((d - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  const color = isPositive ? '#ef4444' : '#3b82f6';
  return (
    <svg width={width} height={height} className="overflow-visible opacity-80">
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
};

// 지수 카드 컴포넌트
const IndexCard = ({ title, data, highlight = false }: { title: React.ReactNode, data: any, highlight?: boolean }) => {
  if (!data || typeof data === 'string') {
    return (
      <div className={`bg-[var(--muted)]/60 p-3 rounded-xl flex flex-col justify-center border ${highlight ? 'border-[var(--primary)]/30 shadow-inner' : 'border-transparent'}`}>
        <span className={`text-[var(--muted-foreground)] text-[1.2rem] mb-0.5 ${highlight ? 'font-extrabold' : ''}`}>{title}</span>
        <span className="text-[var(--muted-foreground)] text-[1.375rem] font-bold">데이터 없음</span>
      </div>
    );
  }
  const is1dPos = parseFloat(data.percent1d) >= 0;
  const is5dPos = parseFloat(data.percent5d) >= 0;
  const color1d = is1dPos ? 'text-red-500' : 'text-blue-500';
  const color5d = is5dPos ? 'text-red-500' : 'text-blue-500';
  
  return (
    <div className={`bg-[var(--muted)]/60 p-3 rounded-xl flex flex-col justify-between border transition-all ${highlight ? 'border-[var(--primary)]/30 shadow-inner bg-[var(--primary)]/5' : 'border-[var(--border)]/30'}`}>
      
      <div className="mb-2">
        <span className={`text-[var(--muted-foreground)] text-[1.2rem] leading-snug break-keep block mb-1 ${highlight ? 'font-extrabold' : 'font-bold'}`}>
          {title}
        </span>
        <div className="w-full flex justify-end">
          <Sparkline data={data.history} isPositive={is1dPos} />
        </div>
      </div>
      
      <div className={`text-[1.5rem] font-extrabold tracking-tight ${color1d} mb-1.5`}>
        {data.value}
      </div>
      
      <div className="flex justify-between items-center text-[1.1rem] font-bold mb-2">
        <span className={`${color1d} bg-[var(--background)] px-1 py-1 rounded border border-[var(--border)] flex-1 text-center mr-0.5`}>
          1일 {is1dPos ? '+' : ''}{data.percent1d}%
        </span>
        <span className={`${color5d} bg-[var(--background)] px-1 py-1 rounded border border-[var(--border)] flex-1 text-center ml-0.5`}>
          5일 {is5dPos ? '+' : ''}{data.percent5d}%
        </span>
      </div>
      
      {data.timestamp && (
        <div className="text-right text-[0.8rem] text-[var(--muted-foreground)] font-medium">
          {new Date(data.timestamp).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 기준
        </div>
      )}
    </div>
  );
};

// 섹션2 키워드 하이라이트 렌더러
const HighlightedText = ({ text, keywords }: { text: string, keywords?: string[] }) => {
  if (!keywords || keywords.length === 0 || !text) return <>{text}</>;
  const escaped = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'g');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        keywords.includes(part)
          ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-700/60 text-inherit font-bold px-0.5 rounded">{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </>
  );
};

function getReportData(isDeepSeek: boolean) {
  try {
    const filePath = path.join(process.cwd(), 'src', 'data', isDeepSeek ? 'deepseek_report.json' : 'latest_report.json');
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return null;
  }
}

export default async function Home({ searchParams }: { searchParams: Promise<{ ai?: string }> }) {
  const resolvedParams = await searchParams;
  const isDeepSeek = resolvedParams?.ai === 'ds';
  const report = getReportData(isDeepSeek);

  const formatDate = (isoString: string) => {
    if (!isoString) return '업데이트 대기중';
    const date = new Date(isoString);
    return `${date.getMonth() + 1}월 ${date.getDate()}일 리포트`;
  };

  const s1 = report?.section1 || report?.market || {};
  const s2 = report?.section2 || { summary: "데이터 생성 중..." };
  const s2Summary = Array.isArray(s2.summary)
    ? s2.summary
    : Array.isArray(s2.summary?.sectors)
    ? s2.summary.sectors
    : s2.summary;
  const major = report?.section3_major || report?.stocks?.filter((s:any)=>s.type==='major') || [];
  const interest = report?.section4_interest || report?.stocks?.filter((s:any)=>s.type==='interest') || [];
  const watchlist = report?.section5_watchlist || [];

  return (
    <div className="min-h-screen bg-[var(--muted)]/20 max-w-[640px] mx-auto shadow-xl relative pb-20 overflow-x-hidden">

      {/* Top Nav */}
      <div className="flex justify-between items-center px-5 py-4 border-b border-[var(--border)] bg-[var(--background)] sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
           <span className="text-[1.8rem] cursor-pointer">☰</span>
           <span className="font-extrabold text-[1.8rem] tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-indigo-500">MoSe News</span>
        </div>
        <div className="flex gap-4 text-[1.8rem]">
          <Link href="/archive" className="cursor-pointer" title="보관함">💾</Link>
          <Link href="/settings" className="cursor-pointer" title="종목 설정">⚙️</Link>
        </div>
      </div>

      <div className="px-4 py-5 space-y-6">
        <div className="flex flex-col mb-2 px-1">
          <div className="text-[1.6rem] font-bold text-[var(--foreground)] flex items-center gap-2 mb-1">
            📅 {formatDate(report?.date)}
          </div>
          {report?.date && (
            <div className="text-[1.1rem] text-[var(--muted-foreground)] font-medium">
              {new Date(report.date).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>

        {/* 거시 및 글로벌 지수 */}
        <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm">
          <h2 className="font-bold text-[1.6rem] mb-3 text-[var(--primary)]">거시 및 글로벌 지수</h2>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <IndexCard title={<><USFlag /> 다우존스</>} data={s1.dowJones} />
            <IndexCard title={<><USFlag /> S&P 500</>} data={s1.sp500} />
            <IndexCard title={<><USFlag /> 나스닥</>} data={s1.nasdaq} />
            <IndexCard title={<><USFlag /> 필라델피아 반도체</>} data={s1.sox} highlight={true} />
            <IndexCard title={<><KRFlag /> 코스피</>} data={s1.kospi} />
            <IndexCard title={<><KRFlag /> 코스닥</>} data={s1.kosdaq} />
            <IndexCard title={<><span className="mr-1">💱</span> 원/달러 환율</>} data={s1.exchangeRate} />
            <IndexCard title={<><span className="mr-1">🛢️</span> WTI 원유</>} data={s1.wti} />
          </div>
          <MacroSummaryClient summaryData={s1.summary || s1.aiSummary} />
        </section>

        {/* 내 종목 맞춤 미국 섹터 */}
        <section className="bg-gradient-to-br from-[var(--primary)]/10 to-[var(--background)] border border-[var(--primary)]/20 rounded-2xl p-4 shadow-sm">
          <h2 className="font-bold text-[1.6rem] mb-3 text-[var(--primary)]">미국 섹터 동향 및 전망</h2>

          {Array.isArray(s2Summary) ? (
            <div className="space-y-4">
              {s2Summary.map((sector: any, idx: number) => {
                const keywords: string[] = sector.keywords || [];
                return (
                  <div key={idx} className="bg-[var(--card)] p-4 rounded-xl border border-[var(--border)] shadow-sm">
                    <h3 className="font-bold text-[1.4rem] mb-3 flex items-center gap-2 flex-wrap">
                      <span className="text-[1.8rem]">{sector.weather?.split(' ')[0]}</span>
                      <span>{sector.sectorName}</span>
                    </h3>
                    {sector.usPeer && sector.usPeer !== 'N/A' && (
                      <div className="flex gap-2 mb-3">
                        <div className="flex flex-col bg-[var(--muted)]/40 border border-[var(--border)] rounded-lg px-3 py-1.5 min-w-[120px] shadow-sm">
                          <span className="text-[1rem] text-[var(--muted-foreground)] font-bold">{sector.usPeer}</span>
                          {sector.usPeerChange && sector.usPeerChange !== 'N/A' ? (() => {
                            const isPos = !sector.usPeerChange.startsWith('-');
                            return (
                              <span className={`text-[1.25rem] font-extrabold ${isPos ? 'text-red-500' : 'text-blue-500'}`}>
                                {sector.usPeerChange}
                              </span>
                            );
                          })() : (
                            <span className="text-[1.25rem] font-bold text-[var(--muted-foreground)]">-</span>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="text-[1.3rem] leading-relaxed mb-3">
                      <span className="font-bold text-blue-600 dark:text-blue-400">간밤 동향: </span>
                      <HighlightedText text={sector.overnightTrend} keywords={keywords} />
                    </div>
                    <div className="text-[1.2rem] leading-relaxed text-[var(--muted-foreground)] bg-[var(--muted)]/30 p-3 rounded-lg mb-2">
                      <span className="font-bold text-[var(--foreground)]">과거 패턴: </span>
                      <HighlightedText text={sector.historicalImpact} keywords={keywords} />
                    </div>
                    {sector.outlook && (
                      <div className="text-[1.2rem] leading-relaxed bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                        <span className="font-bold text-gray-900 dark:text-gray-100">오늘 전망: </span>
                        <span className="text-gray-800 dark:text-gray-200"><HighlightedText text={sector.outlook} keywords={keywords} /></span>
                      </div>
                    )}
                    {keywords.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {keywords.map((kw: string, ki: number) => (
                          <span key={ki} className="text-[1.125rem] bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200 px-2 py-0.5 rounded-full border border-yellow-300 dark:border-yellow-700 font-semibold">
                            #{kw}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="text-[1.2rem] text-[var(--muted-foreground)] text-right mt-2">
                ※ 과거의 패턴이 미래의 결과를 보장하지는 않습니다.
              </div>
            </div>
          ) : (
            <p className="text-[1.3rem] text-[var(--foreground)] leading-relaxed font-medium">
              {typeof s2Summary === 'string' ? s2Summary : "데이터 생성 중..."}
            </p>
          )}
        </section>

        {/* 주요 종목 */}
        <div>
          <h2 className="font-bold text-[1.6rem] px-1 mb-3">주요 종목 <span className="text-[1.2rem] font-normal text-[var(--muted-foreground)]">(리포트/장외거래 포함)</span></h2>
          {major.length > 0 ? major.map((stock: any) => (
            <section key={stock.id || stock.name} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm mb-4 border-l-4 border-l-blue-500">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-[1.625rem]">
                  {stock.name}
                  {stock.industry && <span className="text-[0.7em] text-[var(--muted-foreground)] font-normal ml-2">/ {stock.industry}</span>}
                </h3>
                <span className="text-[1.4rem] font-bold text-[var(--muted-foreground)]">{stock.currentPrice}</span>
              </div>
              <div className="bg-[var(--muted)]/30 p-3 rounded-xl mb-3 text-[1.3rem] leading-relaxed whitespace-pre-line">
                 <strong className="text-blue-500 block mb-1">🤖 AI 분석</strong>
                 {stock.summary}
              </div>
              {stock.news?.map((newsItem: any, index: number) => (
                <AccordionNews key={index} category={newsItem.category} news={{ id: `${stock.name}-${index}`, title: `${index + 1}. ${newsItem.title}`, content: newsItem.link, articleSummary: newsItem.articleSummary }} />
              ))}
            </section>
          )) : <p className="text-[1.4rem] text-[var(--muted-foreground)] px-2">등록된 주요 종목이 없습니다.</p>}
        </div>

        {/* 관심 종목 */}
        <div>
          <h2 className="font-bold text-[1.6rem] px-1 mb-3">관심 종목</h2>
          {interest.length > 0 ? interest.map((stock: any) => (
            <section key={stock.id || stock.name} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm mb-4 border-l-4 border-l-gray-400">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-[1.625rem]">
                  {stock.name}
                  {stock.industry && <span className="text-[0.7em] text-[var(--muted-foreground)] font-normal ml-2">/ {stock.industry}</span>}
                </h3>
                <span className="text-[1.4rem] font-bold text-[var(--muted-foreground)]">{stock.currentPrice}</span>
              </div>
              <div className="bg-[var(--muted)]/30 p-3 rounded-xl mb-3 text-[1.3rem] leading-relaxed whitespace-pre-line">
                 {stock.summary}
              </div>
              {stock.news?.map((newsItem: any, index: number) => (
                <AccordionNews key={index} category={newsItem.category} news={{ id: `${stock.name}-${index}`, title: `${index + 1}. ${newsItem.title}`, content: newsItem.link, articleSummary: newsItem.articleSummary }} />
              ))}
            </section>
          )) : <p className="text-[1.4rem] text-[var(--muted-foreground)] px-2">등록된 관심 종목이 없습니다.</p>}
        </div>

        {/* 관망 종목 */}
        <section className="bg-[var(--background)] border border-[var(--border)] border-dashed rounded-2xl p-4 opacity-80">
          <h2 className="font-bold text-[1.6rem] mb-2 text-[var(--muted-foreground)]">관망 종목 (슬립모드 해제)</h2>
          {watchlist.length > 0 ? (
            watchlist.map((stock:any) => <div key={stock.name}>{stock.name} 깨어남!</div>)
          ) : (
            <p className="text-[1.3rem] text-[var(--muted-foreground)] leading-relaxed mt-2">
              현재 관망 종목 중 뉴스량이 폭증하여 슬립모드가 해제된 종목이 없습니다.
            </p>
          )}
        </section>

      </div>
    </div>
  );
}
