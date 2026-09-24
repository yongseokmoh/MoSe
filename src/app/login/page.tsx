'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = () => {
    // 공통 PIN 번호
    if (pin === '1655') {
      document.cookie = "mose_auth=authenticated; path=/; max-age=31536000"; 
      router.push('/');
      router.refresh();
    } else {
      setError('PIN 번호가 일치하지 않습니다.');
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 relative"
      style={{
        backgroundImage: 'url(/background.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <div className="absolute inset-0 bg-black/50 z-0"></div>

      <div className="bg-[var(--card)]/90 backdrop-blur-md p-8 rounded-3xl shadow-2xl w-full max-w-sm border border-[var(--border)] relative z-10">
        <h1 className="text-[2.6rem] font-extrabold mb-3 text-center bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-indigo-500 tracking-tight">MoSe News</h1>
        <p className="text-[20px] text-[var(--muted-foreground)] mb-8 text-center leading-relaxed font-bold">
          어머님을 위한 맞춤형 투자 뉴스
        </p>
        
        <input 
          type="password" 
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          placeholder="PIN 코드를 입력하세요"
          className="w-full p-4 rounded-2xl border-2 border-[var(--border)] bg-[var(--background)] mb-4 text-center text-[2.0rem] tracking-[0.5em] font-bold focus:border-[var(--primary)] focus:outline-none transition-colors"
          maxLength={4}
        />
        {error && <p className="text-red-500 text-[1.2rem] mb-4 text-center font-semibold">{error}</p>}
        
        <button 
          onClick={handleLogin}
          className="w-full bg-[var(--primary)] text-[var(--primary-foreground)] p-4 rounded-2xl font-bold text-[1.8rem] active:scale-95 transition-transform shadow-md"
        >
          입장하기
        </button>
      </div>
    </div>
  );
}
