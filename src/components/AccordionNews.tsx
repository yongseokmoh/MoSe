'use client';
import { useState } from 'react';

export default function AccordionNews({ news, category }: { news: any, category?: 'most_viewed' | 'sudden' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  
  // Reader Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [articleData, setArticleData] = useState<{title?: string, content?: string, error?: string} | null>(null);
  const [useIframeFallback, setUseIframeFallback] = useState(false);

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

  const handleReadArticle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsModalOpen(true);
    if (articleData || useIframeFallback) return; // Already fetched
    
    setIsReading(true);
    try {
      const res = await fetch(`/api/read?url=${encodeURIComponent(articleUrl)}`);
      const data = await res.json();
      if (res.ok && data.content) {
        setArticleData(data);
      } else {
        console.warn('Reader API returned error, falling back to iframe', data);
        setUseIframeFallback(true);
      }
    } catch (err) {
      console.warn('Network error during Reader API call, falling back to iframe', err);
      setUseIframeFallback(true);
    }
    setIsReading(false);
  };

  return (
    <>
      {/* 아코디언 */}
      <div className={`border rounded-xl mb-2 overflow-hidden shadow-sm ${category === 'sudden' ? 'border-red-400 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20' : category === 'most_viewed' ? 'border-blue-400 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20' : 'border-[var(--border)] bg-[var(--background)]'}`}>
        {/* 아코디언 헤더 */}
        <div
          className="p-3 flex flex-col gap-2 cursor-pointer active:bg-[var(--muted)]/50 transition-colors"
          onClick={() => setIsOpen(!isOpen)}
        >
          <span className="font-semibold text-[1.5rem] leading-snug w-full">
            {category === 'sudden' && <span className="inline-block text-[1rem] bg-red-100 text-red-700 dark:bg-red-900/80 dark:text-red-300 px-2 py-0.5 rounded mr-2 align-middle font-extrabold mb-1">🔥 급상승</span>}
            {category === 'most_viewed' && <span className="inline-block text-[1rem] bg-blue-100 text-blue-700 dark:bg-blue-900/80 dark:text-blue-300 px-2 py-0.5 rounded mr-2 align-middle font-extrabold mb-1">👀 최근 많이 본</span>}
            {cleanTitle}
          </span>
          <div className="w-full flex justify-end">
            <span className="text-[var(--muted-foreground)] text-[1.2rem] bg-[var(--muted)] p-1 rounded-full px-3">
              {isOpen ? '닫기 ▲' : '열기 ▼'}
            </span>
          </div>
        </div>

        {/* 아코디언 바디 */}
        {isOpen && (
          <div className="p-4 bg-[var(--muted)]/20 border-t border-[var(--border)] leading-relaxed">
            {news.articleSummary && (
              <div className="mb-4 text-[1.3125rem] text-[var(--foreground)] bg-[var(--background)] p-3 rounded-lg border border-[var(--border)] shadow-inner whitespace-pre-line">
                <strong className="text-[var(--primary)] mb-1 block">💡 핵심 요약</strong>
                {news.articleSummary}
              </div>
            )}
            
            <div className="flex justify-between gap-3 mb-2">
              <button
                onClick={handleReadArticle}
                className="flex-1 text-[1.3125rem] font-bold bg-blue-500 hover:bg-blue-600 active:scale-95 text-white py-3 rounded-xl shadow transition-all"
              >
                📰 기사 본문 보기
              </button>
              <button
                onClick={handleScrap}
                disabled={isScraping}
                className="flex-1 text-[1.3125rem] bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-[var(--primary-foreground)] py-3 rounded-xl font-bold shadow transition-all active:scale-95 disabled:opacity-50"
              >
                {isScraping ? '저장중 ⏳' : '💾 보관함 스크랩'}
              </button>
            </div>
            <div className="text-center mt-2">
              <a href={articleUrl} target="_blank" rel="noopener noreferrer" className="text-[1.0625rem] text-blue-500 underline">
                외부 브라우저로 원문 열기
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Reader Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[var(--background)] w-full max-w-2xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden relative border border-[var(--border)]">
            <div className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--muted)]/30">
              <h3 className="font-bold text-[1.3rem] truncate pr-4 text-[var(--foreground)]">
                {useIframeFallback ? '원문 브라우저' : (articleData?.title || '기사 읽기')}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-[2rem] leading-none p-2 -m-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                &times;
              </button>
            </div>
            <div className="flex-1 overflow-y-auto bg-white dark:bg-black text-[1.25rem] leading-relaxed relative">
              {isReading ? (
                <div className="flex justify-center items-center h-full text-[var(--muted-foreground)] p-5">
                  기사 본문을 불러오는 중입니다... ⏳
                </div>
              ) : useIframeFallback ? (
                <div className="flex flex-col h-full w-full">
                  <div className="bg-yellow-50 dark:bg-yellow-900/30 p-3 text-[1rem] text-yellow-800 dark:text-yellow-200 text-center flex flex-col gap-2 border-b border-yellow-200 dark:border-yellow-800 shrink-0">
                    <span>자체 뷰어 변환이 지원되지 않는 언론사입니다. 원문 웹페이지를 직접 띄웁니다.</span>
                    <a href={articleUrl} target="_blank" rel="noopener noreferrer" className="bg-white dark:bg-black px-3 py-1.5 rounded border border-yellow-300 dark:border-yellow-700 font-bold shadow-sm inline-block mx-auto hover:bg-gray-50">
                      🚀 새 창에서 열기 (화면이 잘렸거나 안 보일 경우 클릭)
                    </a>
                  </div>
                  <iframe src={articleUrl} className="flex-1 w-full border-none bg-white" sandbox="allow-scripts allow-same-origin allow-popups" title="Article Original Viewer" />
                </div>
              ) : articleData?.content ? (
                <div className="prose dark:prose-invert max-w-none text-[1.25rem] p-5" dangerouslySetInnerHTML={{ __html: articleData.content }} />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
