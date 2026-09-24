'use client';
import { useState } from 'react';

export default function AccordionNews({ news }: { news: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isScraping, setIsScraping] = useState(false);

  const handleScrap = async (e: React.MouseEvent) => {
    e.stopPropagation(); // 아코디언이 닫히지 않도록 이벤트 전파 중단
    setIsScraping(true);
    try {
      const res = await fetch('/api/scrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(news)
      });
      if (res.ok) {
        alert('💾 보관함에 성공적으로 저장되었습니다!');
      } else {
        alert('❌ 저장 실패 (Vercel 환경변수 확인)');
      }
    } catch(e) {
      alert('오류 발생');
    }
    setIsScraping(false);
  };

  // 뉴스 제목을 조금 더 깔끔하게 다듬는 로직 (번호나 특수문자 등)
  const cleanTitle = news.title.replace(/<\/?[^>]+(>|$)/g, "");

  return (
    <div className="border border-[var(--border)] rounded-xl mb-2 overflow-hidden bg-[var(--background)] shadow-sm">
      {/* 아코디언 헤더 (제목) */}
      <div 
        className="p-3 flex justify-between items-center cursor-pointer active:bg-[var(--muted)]/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="font-semibold text-[13px] leading-tight flex-1 pr-2">{cleanTitle}</span>
        <span className="text-[var(--muted-foreground)] text-[10px] bg-[var(--muted)] p-1 rounded-full px-2">
          {isOpen ? '닫기 ▲' : '열기 ▼'}
        </span>
      </div>
      
      {/* 아코디언 바디 (상세 원문 링크 및 스크랩) */}
      {isOpen && (
        <div className="p-4 bg-[var(--muted)]/20 border-t border-[var(--border)] text-[13px] leading-relaxed relative">
          <div className="mb-4 text-[var(--muted-foreground)]">
            자세한 내용은 아래 원문 링크를 통해 확인하실 수 있습니다.
            <a 
              href={news.link || news.content || '#'} 
              target="_blank" 
              rel="noreferrer" 
              className="text-blue-500 underline font-bold block mt-2"
            >
              기사 원문 보기 🔗
            </a>
          </div>
          
          <div className="flex justify-end mt-2">
            <button 
              onClick={handleScrap}
              disabled={isScraping}
              className="text-xs bg-[var(--primary)] text-[var(--primary-foreground)] px-4 py-2 rounded-lg font-bold shadow-sm active:scale-95 transition-transform disabled:opacity-50"
            >
              {isScraping ? '저장중 ⏳' : '💾 보관함에 스크랩'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
