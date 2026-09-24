'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function ArchiveClient({ initialScraps }: { initialScraps: any[] }) {
  const [scraps, setScraps] = useState(initialScraps);
  const [isDeleting, setIsDeleting] = useState(false);

  const formatTime = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getMonth()+1}월 ${d.getDate()}일 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const handleUnscrap = async (scrapedAt: string) => {
    if (!confirm('정말 보관함에서 삭제하시겠습니까?')) return;
    setIsDeleting(true);
    
    // 화면에서 즉시 사라지게 처리 (Optimistic UI)
    const prevScraps = [...scraps];
    setScraps(scraps.filter(s => s.scrapedAt !== scrapedAt));

    try {
      const res = await fetch('/api/unscrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scrapedAt })
      });
      if (!res.ok) {
        alert('❌ 삭제 실패 (서버 오류)');
        setScraps(prevScraps); // 실패 시 원상복구
      }
    } catch (e) {
      alert('오류 발생');
      setScraps(prevScraps); // 실패 시 원상복구
    }
    setIsDeleting(false);
  };

  return (
    <div className="min-h-screen bg-[var(--muted)]/20 max-w-[600px] mx-auto pb-20">
      <div className="flex justify-between items-center px-5 py-4 border-b border-[var(--border)] bg-[var(--background)] sticky top-0 shadow-sm z-10">
        <Link href="/" className="text-[2.2rem]">⬅️</Link>
        <span className="font-extrabold text-[1.8rem] tracking-tight">💾 나의 보관함</span>
        <div className="w-8"></div>
      </div>

      <div className="p-4 space-y-4">
        {scraps.length > 0 ? (
          scraps.map((scrap: any, i: number) => (
             <div key={scrap.scrapedAt || i} className="bg-[var(--card)] p-5 rounded-3xl border border-[var(--border)] shadow-sm relative">
                <h3 className="font-bold text-[22px] mb-3 leading-tight pr-8">{scrap.title}</h3>
                
                {/* 보관해제(삭제) 버튼 추가 */}
                <button 
                  onClick={() => handleUnscrap(scrap.scrapedAt)}
                  disabled={isDeleting}
                  className="absolute top-4 right-4 text-red-500 font-bold bg-red-100/50 w-8 h-8 rounded-full flex items-center justify-center active:scale-95 transition-transform"
                  title="보관 해제"
                >
                  🗑️
                </button>

                <div className="flex justify-between items-end mt-4">
                  <span className="text-[16px] text-[var(--muted-foreground)] bg-[var(--muted)] px-2 py-1 rounded-md">
                    스크랩: {formatTime(scrap.scrapedAt)}
                  </span>
                  <a 
                    href={scrap.link || scrap.content || '#'} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="text-[var(--primary)] text-[1.2rem] font-bold border border-[var(--primary)]/30 px-3 py-1.5 rounded-lg active:bg-[var(--primary)]/10"
                  >
                    원문 보기 🔗
                  </a>
                </div>
             </div>
          ))
        ) : (
          <div className="text-center text-[var(--muted-foreground)] py-16 bg-[var(--card)] rounded-3xl border border-[var(--border)] border-dashed">
            <span className="text-4xl mb-4 block">📭</span>
            보관함이 텅 비어 있습니다.<br/>메인 뉴스에서 <b>'스크랩'</b> 버튼을 눌러보세요!
          </div>
        )}
      </div>
    </div>
  );
}
