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
    // 이미 존재하는지 확인
    if (profile.stocks.find((s: any) => s.name === newStock.trim())) {
      alert('이미 목록에 있는 종목입니다.');
      return;
    }
    const updated = {
      ...profile,
      stocks: [...profile.stocks, { name: newStock.trim(), code: '', type: newType }]
    };
    setProfile(updated);
    setNewStock('');
  };

  const handlePromote = (stock: any) => {
    const newType = stock.type === 'archived' ? 'interest' : 'major';
    setProfile({
      ...profile,
      stocks: profile.stocks.map((s: any) => s.name === stock.name ? { ...s, type: newType } : s)
    });
  };

  const handleDemote = (stock: any) => {
    const newType = stock.type === 'major' ? 'interest' : 'archived';
    setProfile({
      ...profile,
      stocks: profile.stocks.map((s: any) => s.name === stock.name ? { ...s, type: newType } : s)
    });
  };

  const handleRemove = (name: string) => {
    setProfile({
      ...profile,
      stocks: profile.stocks.filter((s: any) => s.name !== name)
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/save-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
      if (res.ok) alert('✅ 저장되었습니다!');
      else alert('❌ 저장 실패');
    } catch (e) {
      alert('오류가 발생했습니다.');
    }
    setIsSaving(false);
  };

  const majorStocks = profile.stocks.filter((s: any) => s.type === 'major');
  const interestStocks = profile.stocks.filter((s: any) => s.type === 'interest');
  const archivedStocks = profile.stocks.filter((s: any) => s.type === 'archived');

  return (
    <div className="min-h-screen bg-[var(--muted)]/20 max-w-[600px] mx-auto pb-20">
      <div className="flex justify-between items-center px-5 py-4 border-b border-[var(--border)] bg-[var(--background)] sticky top-0 shadow-sm z-10">
        <Link href="/" className="text-2xl">⬅️</Link>
        <span className="font-extrabold text-lg tracking-tight">⚙️ 종목 설정</span>
        <button onClick={handleSave} disabled={isSaving} className="font-bold text-[var(--primary)] bg-[var(--primary)]/10 px-4 py-2 rounded-full">
          {isSaving ? '저장중...' : '💾 저장'}
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* 추가 폼 */}
        <div className="bg-[var(--card)] p-5 rounded-3xl border border-[var(--border)] shadow-sm">
          <h3 className="font-bold mb-4 text-base">새 종목 추가</h3>
          <div className="flex gap-2 mb-2">
            <select className="p-3 rounded-xl border border-[var(--border)] bg-[var(--background)] font-medium" value={newType} onChange={e => setNewType(e.target.value)}>
              <option value="major">주요 종목</option>
              <option value="interest">관심 종목</option>
            </select>
            <input 
              className="flex-1 p-3 rounded-xl border border-[var(--border)] bg-[var(--background)]"
              placeholder="예: 카카오" 
              value={newStock} onChange={e => setNewStock(e.target.value)} 
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
          </div>
          <button onClick={handleAdd} className="w-full mt-3 p-3 bg-[var(--foreground)] text-[var(--background)] rounded-xl font-bold">목록에 넣기 ➕</button>
        </div>

        {/* 주요 종목 */}
        <div className="bg-[var(--card)] p-5 rounded-3xl border border-[var(--border)] shadow-sm border-t-4 border-t-[var(--primary)]">
          <h3 className="font-bold mb-3 text-base">🌟 주요 종목 ({majorStocks.length})</h3>
          <div className="divide-y divide-[var(--border)]">
            {majorStocks.map((stock: any) => (
              <div key={stock.name} className="flex justify-between items-center py-3">
                <span className="font-bold text-[15px]">{stock.name}</span> 
                <button onClick={() => handleDemote(stock)} className="text-[var(--muted-foreground)] font-bold px-3 py-1 bg-[var(--muted)] rounded-lg text-sm active:scale-95">
                  해제 ⬇️
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 관심 종목 */}
        <div className="bg-[var(--card)] p-5 rounded-3xl border border-[var(--border)] shadow-sm">
          <h3 className="font-bold mb-3 text-base text-[var(--muted-foreground)]">👀 관심 종목 ({interestStocks.length})</h3>
          <div className="divide-y divide-[var(--border)]">
            {interestStocks.map((stock: any) => (
              <div key={stock.name} className="flex justify-between items-center py-3">
                <span className="font-bold text-[15px] text-[var(--muted-foreground)]">{stock.name}</span> 
                <div className="flex gap-2">
                  <button onClick={() => handlePromote(stock)} className="text-[var(--primary)] font-bold px-3 py-1 bg-[var(--primary)]/10 rounded-lg text-sm active:scale-95">
                    승급 ⬆️
                  </button>
                  <button onClick={() => handleDemote(stock)} className="text-[var(--muted-foreground)] font-bold px-3 py-1 bg-[var(--muted)] rounded-lg text-sm active:scale-95">
                    해제 ⬇️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* (구) 관심종목 (이력 관리) */}
        <div className="bg-[var(--card)]/50 p-5 rounded-3xl border border-[var(--border)] border-dashed shadow-sm opacity-70">
          <h3 className="font-bold mb-3 text-sm text-[var(--muted-foreground)]">🗄️ (구) 관심 종목 (이력 보관) ({archivedStocks.length})</h3>
          <div className="divide-y divide-[var(--border)]">
            {archivedStocks.map((stock: any) => (
              <div key={stock.name} className="flex justify-between items-center py-3">
                <span className="font-medium text-sm text-[var(--muted-foreground)] strike-through">{stock.name}</span> 
                <div className="flex gap-2">
                  <button onClick={() => handlePromote(stock)} className="text-[var(--primary)] font-bold px-3 py-1 bg-[var(--primary)]/10 rounded-lg text-xs active:scale-95">
                    관심으로 복귀 ⬆️
                  </button>
                  <button onClick={() => handleRemove(stock.name)} className="text-red-500 font-bold px-3 py-1 bg-red-100/50 rounded-lg text-xs active:scale-95">
                    영구삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
