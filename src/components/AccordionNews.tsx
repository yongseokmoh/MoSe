'use client';
import { useState } from 'react';

export default function AccordionNews({ news }: { news: any }) {
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
      <div className="border border-[var(--border)] rounded-xl mb-2 overflow-hidden bg-[var(--background)] shadow-sm">
        {/* 아코디언 헤더 */}
        <div
          className="p-3 flex justify-between items-center cursor-pointer active:bg-[var(--muted)]/50 transition-colors"
          onClick={() => setIsOpen(!isOpen)}
        >
          <span className="font-semibold text-[24px] leading-snug flex-1 pr-2">{cleanTitle}</span>
          <span className="text-[var(--muted-foreground)] text-[25px] bg-[var(--muted)] p-1 rounded-full px-2 shrink-0">
            {isOpen ? '닫기 ▲' : '열기 ▼'}
          </span>
        </div>

        {/* 아코디언 바디 */}
        {isOpen && (
          <div className="p-4 bg-[var(--muted)]/20 border-t border-[var(--border)] leading-relaxed">
            <button
              onClick={() => setShowModal(true)}
              className="w-full text-[22px] font-bold bg-blue-500 hover:bg-blue-600 active:scale-95 text-white py-3 px-4 rounded-xl shadow transition-all mb-2"
            >
              📰 기사 원문 보기
            </button>
            <p className="text-[18px] text-[var(--muted-foreground)] text-center mb-4">
              ※ 일부 기사는 외부 정책으로 표시되지 않을 수 있습니다.
            </p>

            <div className="flex justify-end">
              <button
                onClick={handleScrap}
                disabled={isScraping}
                className="text-[21px] bg-[var(--primary)] text-[var(--primary-foreground)] px-4 py-2 rounded-lg font-bold shadow-sm active:scale-95 transition-transform disabled:opacity-50"
              >
                {isScraping ? '저장중 ⏳' : '💾 보관함에 스크랩'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
