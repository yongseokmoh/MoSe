'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function SettingsClient({ initialProfile }: { initialProfile: any }) {
  const [profile, setProfile] = useState(initialProfile);
  const [newStock, setNewStock] = useState('');
  const [newType, setNewType] = useState('major');
  const [isSaving, setIsSaving] = useState(false);

  const handleAdd = () => {
    if (!newStock.trim()) return;
    const updated = {
      ...profile,
      // 종목 코드는 MVP 단계에서는 빈 값으로 넣고, 스크립트에서 이름으로 검색하도록 처리되어 있습니다.
      stocks: [...profile.stocks, { name: newStock.trim(), code: '', type: newType }]
    };
    setProfile(updated);
    setNewStock('');
  };

  const handleRemove = (name: string) => {
    const updated = {
      ...profile,
      stocks: profile.stocks.filter((s: any) => s.name !== name)
    };
    setProfile(updated);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/save-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
      if (res.ok) {
        alert('✅ 성공적으로 저장되었습니다!\n\n(참고: Vercel 자동 배포가 돌아가기 때문에 메인 화면에 반영되기까지 약 1~2분 정도 소요될 수 있습니다.)');
      } else {
        alert('❌ 저장 실패 (Vercel 환경변수에 GITHUB_PAT 및 GITHUB_REPO 설정이 필요합니다.)');
      }
    } catch (e) {
      alert('오류가 발생했습니다.');
    }
    setIsSaving(false);
  };

  return (
    <div className="min-h-screen bg-[var(--muted)]/20 max-w-[600px] mx-auto pb-20">
      <div className="flex justify-between items-center px-5 py-4 border-b border-[var(--border)] bg-[var(--background)] sticky top-0 shadow-sm z-10">
        <Link href="/" className="text-2xl">⬅️</Link>
        <span className="font-extrabold text-lg tracking-tight">⚙️ 종목 설정</span>
        <button 
          onClick={handleSave} 
          disabled={isSaving} 
          className="font-bold text-[var(--primary)] disabled:opacity-50 bg-[var(--primary)]/10 px-4 py-2 rounded-full"
        >
          {isSaving ? '저장중...' : '💾 저장하기'}
        </button>
      </div>

      <div className="p-4 space-y-6">
        {/* 추가 폼 */}
        <div className="bg-[var(--card)] p-5 rounded-3xl border border-[var(--border)] shadow-sm">
          <h3 className="font-bold mb-4 text-base">새 종목 추가</h3>
          <div className="flex gap-2 mb-2">
            <select 
              className="p-3 rounded-xl border border-[var(--border)] bg-[var(--background)] font-medium" 
              value={newType} 
              onChange={e => setNewType(e.target.value)}
            >
              <option value="major">주요 종목</option>
              <option value="interest">관심 종목</option>
            </select>
            <input 
              className="flex-1 p-3 rounded-xl border border-[var(--border)] bg-[var(--background)]"
              placeholder="예: 카카오" 
              value={newStock} 
              onChange={e => setNewStock(e.target.value)} 
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
          </div>
          <button onClick={handleAdd} className="w-full mt-3 p-3 bg-[var(--foreground)] text-[var(--background)] rounded-xl font-bold active:scale-95 transition-transform">
            목록에 넣기 ➕
          </button>
        </div>

        {/* 현재 목록 */}
        <div className="bg-[var(--card)] p-5 rounded-3xl border border-[var(--border)] shadow-sm">
          <h3 className="font-bold mb-4 text-base">나의 종목 리스트</h3>
          {profile.stocks.length === 0 ? (
            <p className="text-center text-[var(--muted-foreground)] py-4 text-sm">등록된 종목이 없습니다.</p>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {profile.stocks.map((stock: any) => (
                <div key={stock.name} className="flex justify-between items-center py-4">
                  <div>
                    <span className="font-bold text-base">{stock.name}</span> 
                    <span className="text-[11px] text-[var(--primary)] bg-[var(--primary)]/10 px-2 py-1 rounded-md ml-2 font-semibold">
                      {stock.type === 'major' ? '주요' : '관심'}
                    </span>
                  </div>
                  <button onClick={() => handleRemove(stock.name)} className="text-red-500 font-bold px-3 py-1 bg-red-100 rounded-lg text-sm active:scale-95">
                    삭제 🗑️
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
