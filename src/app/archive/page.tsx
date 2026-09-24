import fs from 'fs';
import path from 'path';
import Link from 'next/link';

export default function ArchivePage() {
  let profile = { scraps: [] };
  try {
    const filePath = path.join(process.cwd(), 'src', 'data', 'user_profile.json');
    const fileContents = fs.readFileSync(filePath, 'utf8');
    profile = JSON.parse(fileContents);
  } catch (error) {
    console.error('Failed to load user profile in archive');
  }

  // 날짜 포맷팅 함수
  const formatTime = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getMonth()+1}월 ${d.getDate()}일 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[var(--muted)]/20 max-w-[600px] mx-auto pb-20">
      <div className="flex justify-between items-center px-5 py-4 border-b border-[var(--border)] bg-[var(--background)] sticky top-0 shadow-sm z-10">
        <Link href="/" className="text-2xl">⬅️</Link>
        <span className="font-extrabold text-lg tracking-tight">💾 나의 보관함</span>
        <div className="w-8"></div> {/* 여백용 */}
      </div>

      <div className="p-4 space-y-4">
        {profile.scraps && profile.scraps.length > 0 ? (
          profile.scraps.map((scrap: any, i: number) => (
             <div key={i} className="bg-[var(--card)] p-5 rounded-3xl border border-[var(--border)] shadow-sm">
                <h3 className="font-bold text-[15px] mb-3 leading-tight">{scrap.title}</h3>
                
                <div className="flex justify-between items-end mt-4">
                  <span className="text-[11px] text-[var(--muted-foreground)] bg-[var(--muted)] px-2 py-1 rounded-md">
                    스크랩: {formatTime(scrap.scrapedAt)}
                  </span>
                  <a 
                    href={scrap.link || scrap.content || '#'} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="text-[var(--primary)] text-xs font-bold border border-[var(--primary)]/30 px-3 py-1.5 rounded-lg active:bg-[var(--primary)]/10"
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
