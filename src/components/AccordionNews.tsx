'use client';
import { useState } from 'react';

export default function AccordionNews({ news, category }: { news: any, category?: 'most_viewed' | 'sudden' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const handleScrap = async (e: React.MouseEvent) => {
    e.stopPropagation();
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

  const cleanTitle = news.title.replace(/<\/?[^>]+(>|$)/g, "");
  const articleUrl = news.link || news.content || '#';

  return (
    <>
      {/* 인라인 기사 모달 */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setShowModal(false)}
        >
          <div
            className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden"
            style={{ width: '95vw', height: '85vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
              <span className="text-[20px] font-bold text-zinc-700 dark:text-zinc-200 truncate pr-4">
                📰 기사 원문
              </span>
              <button
                onClick={() => setShowModal(false)}
                className="text-[26px] leading-none text-zinc-500 hover:text-zinc-800 dark:hover:text-white transition-colors font-bold"
              >
                ✕
              </button>
            </div>
            {/* 외부 링크 안내 + iframe */}
            <iframe
              src={articleUrl}
              className="w-full"
              style={{ height: 'calc(85vh - 56px)' }}
              title="기사 원문"
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          </div>
        </div>
      )}

      {/* 아코디언 */}
      <div className={`border rounded-xl mb-2 overflow-hidden shadow-sm ${category === 'sudden' ? 'border-red-400 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20' : category === 'most_viewed' ? 'border-blue-400 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20' : 'border-[var(--border)] bg-[var(--background)]'}`}>
        {/* 아코디언 헤더 */}
        <div
          className="p-3 flex justify-between items-center cursor-pointer active:bg-[var(--muted)]/50 transition-colors"
          onClick={() => setIsOpen(!isOpen)}
        >
          <span className="font-semibold text-[24px] leading-snug flex-1 pr-2">
            {category === 'sudden' && <span className="inline-block text-[16px] bg-red-100 text-red-700 dark:bg-red-900/80 dark:text-red-300 px-2 py-0.5 rounded mr-2 align-middle font-extrabold mb-1">🔥 급상승</span>}
            {category === 'most_viewed' && <span className="inline-block text-[16px] bg-blue-100 text-blue-700 dark:bg-blue-900/80 dark:text-blue-300 px-2 py-0.5 rounded mr-2 align-middle font-extrabold mb-1">👀 많이 본</span>}
            {cleanTitle}
          </span>
          <span className="text-[var(--muted-foreground)] text-[25px] bg-[var(--muted)] p-1 rounded-full px-2 shrink-0">
            {isOpen ? '닫기 ▲' : '열기 ▼'}
          </span>
        </div>

        {/* 아코디언 바디 */}
        {isOpen && (
          <div className="p-4 bg-[var(--muted)]/20 border-t border-[var(--border)] leading-relaxed">
            {news.articleSummary && (
              <div className="mb-4 text-[21px] text-[var(--foreground)] bg-[var(--background)] p-3 rounded-lg border border-[var(--border)] shadow-inner">
                <strong className="text-[var(--primary)] mb-1 block">💡 핵심 요약</strong>
                {news.articleSummary}
              </div>
            )}
            
            <div className="flex justify-between gap-3 mb-2">
              <button
                onClick={() => setShowModal(true)}
                className="flex-1 text-[21px] font-bold bg-blue-500 hover:bg-blue-600 active:scale-95 text-white py-3 rounded-xl shadow transition-all"
              >
                📰 기사 원문 보기
              </button>
              <button
                onClick={handleScrap}
                disabled={isScraping}
                className="flex-1 text-[21px] bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-[var(--primary-foreground)] py-3 rounded-xl font-bold shadow transition-all active:scale-95 disabled:opacity-50"
              >
                {isScraping ? '저장중 ⏳' : '💾 보관함 스크랩'}
              </button>
            </div>
            
            <p className="text-[17px] text-[var(--muted-foreground)] text-center mt-2">
              ※ 일부 기사는 외부 정책으로 원문 뷰어에 표시되지 않을 수 있습니다.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
