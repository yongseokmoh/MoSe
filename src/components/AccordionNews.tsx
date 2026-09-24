'use client';

import { useState } from 'react';

interface NewsItem {
  id: string;
  title: string;
  summary: string;
  content: string;
}

export default function AccordionNews({ news }: { news: NewsItem }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden mt-3 bg-[var(--background)] shadow-sm">
      <button 
        className="w-full text-left p-3.5 text-sm font-semibold hover:bg-[var(--muted)]/30 flex justify-between items-center transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="truncate pr-2">{news.title}</span>
        <span className="text-[var(--muted-foreground)] text-xs bg-[var(--muted)] px-2 py-1 rounded-full whitespace-nowrap">
          {isOpen ? '접기 🔺' : '펼치기 ⬇️'}
        </span>
      </button>
      
      <div 
        className={`bg-[var(--muted)]/20 px-3.5 text-[13px] text-[var(--foreground)] leading-relaxed transition-all duration-300 ease-in-out overflow-hidden ${isOpen ? 'max-h-[800px] opacity-100 py-3' : 'max-h-0 opacity-0 py-0'}`}
      >
        <div className="border-t border-[var(--border)] space-y-3 pt-3">
          <p>
            <strong className="text-[var(--primary)] block mb-1">🤖 AI 핵심 요약</strong>
            {news.summary}
          </p>
          <div className="text-[var(--muted-foreground)] text-xs border-l-2 border-[var(--muted)] pl-2">
            {news.content}
          </div>
          
          <div className="flex justify-end gap-2 mt-2 pt-3 border-t border-[var(--border)] border-dashed">
            <button className="px-4 py-1.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-full text-xs font-bold shadow-sm hover:opacity-90 active:scale-95 transition-all">
              💾 보관함에 저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
