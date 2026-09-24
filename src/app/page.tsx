import AccordionNews from '@/components/AccordionNews';
import MacroSummaryClient from '@/components/MacroSummaryClient';
import fs from 'fs';
import path from 'path';
import Link from 'next/link';

// 誘몃땲 李⑦듃 (Sparkline) 而댄룷?뚰듃
const Sparkline = ({ data, isPositive }: { data: number[], isPositive: boolean }) => {
  if (!data || data.length < 2) return <div className="w-[40px] h-[15px]"></div>;
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  
  const width = 40;
  const height = 15;
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((d - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  const color = isPositive ? '#ef4444' : '#3b82f6'; // ?곸듅 鍮④컯, ?섎씫 ?뚮옉 (?쒓뎅??

  return (
    <svg width={width} height={height} className="overflow-visible opacity-70">
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
};

// 吏??移대뱶 而댄룷?뚰듃
const IndexCard = ({ title, data, highlight = false }: { title: string, data: any, highlight?: boolean }) => {
  if (!data || typeof data === 'string') {
    return (
      <div className={`bg-[var(--muted)]/60 p-2.5 rounded-xl flex flex-col justify-center border ${highlight ? 'border-[var(--primary)]/30 shadow-inner' : 'border-transparent'}`}>
        <span className={`text-[var(--muted-foreground)] text-[22px] mb-0.5 ${highlight ? 'font-extrabold' : ''}`}>{title}</span>
        <span className="text-[var(--muted-foreground)] text-[1.2rem] font-bold">?곗씠???놁쓬</span>
      </div>
    );
  }

  const is1dPos = parseFloat(data.percent1d) >= 0;
  const is5dPos = parseFloat(data.percent5d) >= 0;
  
  const color1d = is1dPos ? 'text-red-500' : 'text-blue-500';
  const color5d = is5dPos ? 'text-red-500' : 'text-blue-500';

  return (
    <div className={`bg-[var(--muted)]/60 p-2.5 rounded-xl flex flex-col justify-between border transition-all ${highlight ? 'border-[var(--primary)]/30 shadow-inner bg-[var(--primary)]/5' : 'border-[var(--border)]/30'}`}>
      <div className="flex justify-between items-center mb-1">
        <span className={`text-[var(--muted-foreground)] text-[22px] ${highlight ? 'font-extrabold' : 'font-bold'}`}>{title}</span>
        <Sparkline data={data.history} isPositive={is1dPos} />
      </div>
      <div className={`text-[20px] font-extrabold tracking-tight ${color1d} mb-1.5`}>
        {data.value}
      </div>
      <div className="flex justify-between items-center text-[21px] font-bold">
        <span className={`${color1d} bg-[var(--background)] px-1 py-0.5 rounded border border-[var(--border)] flex-1 text-center mr-0.5`}>
          1??{is1dPos ? '+' : ''}{data.percent1d}%
        </span>
        <span className={`${color5d} bg-[var(--background)] px-1 py-0.5 rounded border border-[var(--border)] flex-1 text-center ml-0.5`}>
          5??{is5dPos ? '+' : ''}{data.percent5d}%
        </span>
      </div>
    </div>
  );
};

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
    if (!isoString) return '?낅뜲?댄듃 ?湲곗쨷';
    const date = new Date(isoString);
    return `${date.getFullYear()}??${date.getMonth() + 1}??${date.getDate()}??由ы룷??;
  };

  // 援ы삎 JSON ?섏쐞 ?명솚???꾪븳 ?덉쟾?μ튂
  const s1 = report?.section1 || report?.market || {};
  const s2 = report?.section2 || { summary: "?곗씠???앹꽦 以?.." };
  const major = report?.section3_major || report?.stocks?.filter((s:any)=>s.type==='major') || [];
  const interest = report?.section4_interest || report?.stocks?.filter((s:any)=>s.type==='interest') || [];
  const watchlist = report?.section5_watchlist || [];

  return (
    <div className="min-h-screen bg-[var(--muted)]/20 max-w-[600px] mx-auto shadow-xl relative pb-20 overflow-x-hidden">
      
      {/* Top Nav */}
      <div className="flex justify-between items-center px-5 py-4 border-b border-[var(--border)] bg-[var(--background)] sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
           <span className="text-[2.0rem] cursor-pointer">??/span>
           <span className="font-extrabold text-[1.8rem] tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-indigo-500">MoSe News</span>
        </div>
        <div className="flex gap-4 text-[2.0rem]">
          <Link href="/archive" className="cursor-pointer" title="蹂닿???>?뮶</Link>
          <Link href="/settings" className="cursor-pointer" title="醫낅ぉ ?ㅼ젙">?숋툘</Link>
        </div>
      </div>

      <div className="px-4 py-5 space-y-6">
        <div className="text-[1.4rem] font-bold text-[var(--foreground)] px-1 flex items-center gap-2">
          ?뱟 {formatDate(report?.date)}
        </div>

        {/* Section 1: 嫄곗떆/利앹떆 ?뺣낫 */}
        <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm">
          <h2 className="font-bold text-[1.6rem] mb-3 text-[var(--primary)]">?뱀뀡 1: 嫄곗떆 諛?湲濡쒕쾶 吏??/h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
            <IndexCard title="?눣?눡 S&P 500" data={s1.sp500} />
            <IndexCard title="?눣?눡 ?섏뒪?? data={s1.nasdaq} />
            <IndexCard title="?눣?눡 ?꾨씪?명뵾??諛섎룄泥? data={s1.sox} highlight={true} />
            <IndexCard title="?눖?눟 肄붿뒪?? data={s1.kospi} />
            <IndexCard title="?눖?눟 肄붿뒪?? data={s1.kosdaq} />
            <IndexCard title="?뮦 ???щ윭 ?섏쑉" data={s1.exchangeRate} />
          </div>
          <MacroSummaryClient summaryData={s1.summary || s1.aiSummary} />
        </section>

        {/* Section 2: ?좏뻾 ?뺣낫 (誘멸뎅 利앹떆 二쇱슂 ?뱁꽣 蹂?? */}
        <section className="bg-gradient-to-br from-[var(--primary)]/10 to-[var(--background)] border border-[var(--primary)]/20 rounded-2xl p-4 shadow-sm">
          <h2 className="font-bold text-[1.6rem] mb-3 text-[var(--primary)]">?뱀뀡 2: ?좏뻾 ?뺣낫 (??醫낅ぉ 留욎땄 誘멸뎅 ?뱁꽣)</h2>
          
          {Array.isArray(s2.summary) ? (
            <div className="space-y-4">
              {s2.summary.map((sector: any, idx: number) => (
                <div key={idx} className="bg-[var(--card)] p-3.5 rounded-xl border border-[var(--border)] shadow-sm">
                  <h3 className="font-bold text-[21px] mb-2 flex items-center gap-2">
                    <span className="text-[1.8rem]">{sector.weather?.split(' ')[0]}</span>
                    <span>{sector.sectorName}</span>
                    <span className="text-[16px] font-normal text-[var(--muted-foreground)] bg-[var(--muted)] px-2 py-0.5 rounded-md border border-[var(--border)]">
                      誘멸뎅 ??μ＜: {sector.usPeer}
                    </span>
                  </h3>
                  <div className="text-[20px] leading-relaxed mb-2.5">
                    <span className="font-bold text-blue-600 dark:text-blue-400">媛꾨갇 ?숉뼢:</span> {sector.overnightTrend}
                  </div>
                  <div className="text-[18px] leading-relaxed text-[var(--muted-foreground)] bg-[var(--muted)]/30 p-2 rounded-lg">
                    <span className="font-bold">怨쇨굅 ?⑦꽩:</span> {sector.historicalImpact}
                  </div>
                </div>
              ))}
              <div className="text-[22px] text-[var(--muted-foreground)] text-right mt-2">
                ??怨쇨굅???⑦꽩??誘몃옒??寃곌낵瑜?蹂댁옣?섏????딆뒿?덈떎.
              </div>
            </div>
          ) : (
            <p className="text-[20px] text-[var(--foreground)] leading-relaxed font-medium">
              {typeof s2.summary === 'string' ? s2.summary : "?곗씠???앹꽦 以?.."}
            </p>
          )}
        </section>

        {/* Section 3: 二쇱슂 醫낅ぉ */}
        <div>
          <h2 className="font-bold text-[1.6rem] px-1 mb-3">?뱀뀡 3: 二쇱슂 醫낅ぉ <span className="text-[1.2rem] font-normal text-[var(--muted-foreground)]">(由ы룷???μ쇅嫄곕옒 ?ы븿)</span></h2>
          {major.length > 0 ? major.map((stock: any) => (
            <section key={stock.id || stock.name} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm mb-4 border-l-4 border-l-blue-500">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-[22px]">{stock.name}</h3>
                <span className="text-[1.4rem] font-bold text-[var(--muted-foreground)]">{stock.currentPrice}</span>
              </div>
              <div className="bg-[var(--muted)]/30 p-3 rounded-xl mb-3 text-[20px] leading-relaxed">
                 <strong className="text-blue-500 block mb-1">?쨼 AI 遺꾩꽍</strong>
                 {stock.summary}
              </div>
              {stock.news?.map((newsItem: any, index: number) => (
                <AccordionNews key={index} news={{ id: `${stock.name}-${index}`, title: `${index + 1}. ${newsItem.title}`, content: newsItem.link }} />
              ))}
            </section>
          )) : <p className="text-[1.2rem] text-[var(--muted-foreground)] px-2">?깅줉??二쇱슂 醫낅ぉ???놁뒿?덈떎.</p>}
        </div>

        {/* Section 4: 愿??醫낅ぉ */}
        <div>
          <h2 className="font-bold text-[1.6rem] px-1 mb-3">?뱀뀡 4: 愿??醫낅ぉ</h2>
          {interest.length > 0 ? interest.map((stock: any) => (
            <section key={stock.id || stock.name} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm mb-4 border-l-4 border-l-gray-400">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-[22px]">{stock.name}</h3>
                <span className="text-[1.4rem] font-bold text-[var(--muted-foreground)]">{stock.currentPrice}</span>
              </div>
              <div className="bg-[var(--muted)]/30 p-3 rounded-xl mb-3 text-[20px] leading-relaxed">
                 {stock.summary}
              </div>
              {stock.news?.map((newsItem: any, index: number) => (
                <AccordionNews key={index} news={{ id: `${stock.name}-${index}`, title: `${index + 1}. ${newsItem.title}`, content: newsItem.link }} />
              ))}
            </section>
          )) : <p className="text-[1.2rem] text-[var(--muted-foreground)] px-2">?깅줉??愿??醫낅ぉ???놁뒿?덈떎.</p>}
        </div>

        {/* Section 5: 愿留?醫낅ぉ (?щ┰紐⑤뱶 ?댁젣) */}
        <section className="bg-[var(--background)] border border-[var(--border)] border-dashed rounded-2xl p-4 opacity-80">
          <h2 className="font-bold text-[1.6rem] mb-2 text-[var(--muted-foreground)]">?뱀뀡 5: 愿留?醫낅ぉ (?щ┰紐⑤뱶 ?댁젣)</h2>
          {watchlist.length > 0 ? (
            watchlist.map((stock:any) => <div key={stock.name}>{stock.name} 源⑥뼱??</div>)
          ) : (
            <p className="text-[1.2rem] text-[var(--muted-foreground)] leading-relaxed mt-2">
              ?꾩옱 愿留?醫낅ぉ((援? 愿?ъ쥌紐? 以??댁뒪?됱씠 ??쬆?섏뿬 ?щ┰紐⑤뱶媛 ?댁젣??醫낅ぉ???놁뒿?덈떎. ?뚭퀬由ъ쬁 ?곕룞 ?湲?以묒엯?덈떎.
            </p>
          )}
        </section>

      </div>
    </div>
  );
}


