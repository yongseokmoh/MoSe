'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = () => {
    // 기본 설정된 공통 PIN 번호 (추후 환경변수로 변경 가능)
    if (pin === '1234') {
      // 1년간 유효한 인증 쿠키 생성
      document.cookie = "mose_auth=authenticated; path=/; max-age=31536000"; 
      router.push('/');
      router.refresh();
    } else {
      setError('PIN 번호가 일치하지 않습니다.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--muted)]/20 p-4">
      <div className="bg-[var(--card)] p-8 rounded-3xl shadow-xl w-full max-w-sm border border-[var(--border)]">
        <h1 className="text-3xl font-extrabold mb-3 text-center bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-indigo-500 tracking-tight">MoSe News</h1>
        <p className="text-sm text-[var(--muted-foreground)] mb-8 text-center leading-relaxed">
          어머님과 대표님 전용 공간입니다.<br/>PIN 번호를 입력해주세요.
        </p>
        
        <input 
          type="password" 
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          placeholder="4자리 입력 (기본: 1234)"
          className="w-full p-4 rounded-2xl border-2 border-[var(--border)] bg-[var(--background)] mb-4 text-center text-xl tracking-[0.5em] font-bold focus:border-[var(--primary)] focus:outline-none transition-colors"
          maxLength={4}
        />
        {error && <p className="text-red-500 text-xs mb-4 text-center font-semibold">{error}</p>}
        
        <button 
          onClick={handleLogin}
          className="w-full bg-[var(--primary)] text-[var(--primary-foreground)] p-4 rounded-2xl font-bold text-lg active:scale-95 transition-transform shadow-md"
        >
          입장하기
        </button>
      </div>
    </div>
  );
}
