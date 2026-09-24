import AccordionNews from '@/components/AccordionNews';

export default function Home() {
  const dummyNews = {
    id: '1',
    title: '1. 차세대 HBM 양산 돌입',
    summary: '엔비디아 납품을 위한 HBM 테스트를 최종 통과했으며 다음 달부터 대량 양산에 들어갑니다. 메모리 사이클 회복세 진입이 뚜렷합니다.',
    content: '(기사 원문 텍스트... 삼성전자가 세계 최고 수준의 집적도를 가진 HBM3E 12단 제품을...)'
  };

  return (
    <div className="min-h-screen bg-[var(--muted)]/20 max-w-[600px] mx-auto shadow-xl relative pb-20 overflow-x-hidden">
      
      {/* Top Navigation */}
      <div className="flex justify-between items-center px-5 py-4 border-b border-[var(--border)] bg-[var(--background)] sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
           <span className="text-xl cursor-pointer">☰</span>
           <span className="font-extrabold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-indigo-500">MoSe News</span>
        </div>
        <div className="flex gap-4 text-lg">
          <span className="cursor-pointer" title="종목 설정">⚙️</span>
          <span className="cursor-pointer" title="테마 변경">🌙</span>
        </div>
      </div>

      <div className="px-4 py-5 space-y-6">
        
        <div className="text-sm font-bold text-[var(--foreground)] px-1 flex items-center gap-2">
          📅 2024년 9월 24일 리포트
        </div>

        {/* Section 1: Market */}
        <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm">
          <h3 className="font-bold text-sm mb-3">거시/증시 요약</h3>
          <div className="grid grid-cols-2 gap-2 text-xs mb-3 font-medium">
            <div className="bg-[var(--muted)]/60 p-2.5 rounded-xl flex justify-between">
              <span>🇺🇸 나스닥</span> <span className="text-red-500">+1.2%</span>
            </div>
            <div className="bg-[var(--muted)]/60 p-2.5 rounded-xl flex justify-between">
              <span>🇰🇷 코스피</span> <span className="text-red-500">+0.5%</span>
            </div>
            <div className="bg-[var(--muted)]/60 p-2.5 rounded-xl flex justify-between">
              <span>💱 환율</span> <span>1,350원</span>
            </div>
            <div className="bg-[var(--muted)]/60 p-2.5 rounded-xl flex justify-between">
              <span>🛢️ 유가</span> <span>$75.00</span>
            </div>
          </div>
          <p className="text-xs text-[var(--muted-foreground)] leading-relaxed bg-[var(--background)] p-3 rounded-xl border border-[var(--border)]/50">
            <span className="text-[var(--primary)] font-bold mb-1 block">🤖 AI 증시 요약</span> 
            어제 미국 증시는 빅테크 실적 호조로 상승 마감했습니다. 오늘은 국내 반도체 섹터의 강세가 예상됩니다.
          </p>
        </section>

        {/* Section 3: Major Stock */}
        <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm border-l-4 border-l-[var(--primary)]">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-base">삼성전자 <span className="text-xs text-[var(--muted-foreground)] font-normal ml-1">나의 주요종목</span></h3>
            <span className="text-sm text-red-500 font-bold">75,000 🔺</span>
          </div>
          
          <AccordionNews news={dummyNews} />
          
          {/* Dummy closed item */}
          <div className="border border-[var(--border)] rounded-xl overflow-hidden mt-2 bg-[var(--background)] shadow-sm">
            <button className="w-full text-left p-3.5 text-sm font-semibold hover:bg-[var(--muted)]/30 flex justify-between items-center transition-colors">
              <span className="truncate pr-2">2. 외국인 연속 순매수 행진</span>
              <span className="text-[var(--muted-foreground)] text-xs bg-[var(--muted)] px-2 py-1 rounded-full">펼치기 ⬇️</span>
            </button>
          </div>
        </section>
        
        <div className="pb-6 pt-4 text-center text-xs text-[var(--muted-foreground)]">
          끝까지 다 읽으셨습니다! 수고하셨습니다.
        </div>

      </div>
    </div>
  );
}
