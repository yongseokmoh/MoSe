'use client';
import { useState } from 'react';

export default function MacroSummaryClient({ summaryData }: { summaryData: any }) {
  const [selectedKeyword, setSelectedKeyword] = useState<any>(null);

  if (!summaryData) return <p className="text-[20px] p-3">요약 데이터가 없습니다.</p>;

  // 문자열 형태인 경우 (구버전 호환)
  if (typeof summaryData === 'string') {
    return (
      <p className="text-[20px] text-[var(--foreground)] leading-relaxed bg-[var(--background)] p-3 rounded-xl border border-[var(--border)]/50">
        {summaryData}
      </p>
    );
  }

  const { summaryText, keywords } = summaryData;

  // 키워드를 찾아 클릭 가능한 스팬 태그로 치환하는 로직
  const renderText = () => {
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) return summaryText;

    // 키워드들을 정규식(Regex)으로 변환 (안전을 위해 특수문자 이스케이프)
    const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${keywords.map((k: any) => escapeRegExp(k.word)).join('|')})`, 'g');
    
    const parts = [];
    let currentIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(summaryText)) !== null) {
      if (match.index > currentIndex) {
        parts.push(summaryText.substring(currentIndex, match.index));
      }
      const keywordObj = keywords.find((k: any) => k.word === match[0]);
      parts.push(
        <span 
          key={match.index} 
          onClick={() => setSelectedKeyword(keywordObj)}
          className="text-blue-600 dark:text-blue-400 font-extrabold cursor-pointer border-b-2 border-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 active:bg-blue-200 transition-colors"
        >
          {match[0]}
        </span>
      );
      currentIndex = regex.lastIndex;
    }
    if (currentIndex < summaryText.length) {
      parts.push(summaryText.substring(currentIndex));
    }

    return parts;
  };

  return (
    <>
      <div className="text-[21px] text-[var(--foreground)] leading-[1.8] bg-[var(--background)] p-4 rounded-xl border border-[var(--border)]/50 shadow-inner font-medium">
        {renderText()}
        {keywords && keywords.length > 0 && (
          <div className="text-[16px] text-[var(--muted-foreground)] mt-4 flex items-center gap-1.5 font-bold bg-[var(--muted)]/50 p-2 rounded-lg w-fit">
            <span>👆</span> 파란색 단어를 누르면 배경이 된 뉴스를 볼 수 있습니다.
          </div>
        )}
      </div>

      {/* 팝업 모달 */}
      {selectedKeyword && (
        <div 
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" 
          onClick={() => setSelectedKeyword(null)}
        >
          <div 
            className="bg-[var(--background)] rounded-3xl p-6 max-w-sm w-full shadow-2xl relative border border-[var(--border)]" 
            onClick={e => e.stopPropagation()}
          >
            <button 
              onClick={() => setSelectedKeyword(null)}
              className="absolute top-4 right-4 bg-[var(--muted)] hover:bg-[var(--border)] w-8 h-8 rounded-full flex items-center justify-center font-bold text-gray-500 transition-colors active:scale-95"
            >
              ✕
            </button>
            <h3 className="font-extrabold text-[22px] mb-4 pr-8 text-blue-600 bg-blue-50 dark:bg-blue-950 inline-block px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900">
              "{selectedKeyword.word}"
            </h3>
            <p className="text-[22px] leading-relaxed font-medium mb-6">
              {selectedKeyword.newsSummary}
            </p>
            {selectedKeyword.originalLink && (
              <a 
                href={selectedKeyword.originalLink} 
                target="_blank" 
                rel="noreferrer" 
                className="block w-full text-center py-3.5 bg-[var(--foreground)] text-[var(--background)] rounded-xl font-bold text-[1.4rem] hover:opacity-90 active:scale-95 transition-all shadow-md"
              >
                원문 기사 보러가기 🔗
              </a>
            )}
          </div>
        </div>
      )}
    </>
  );
}
