import ArchiveClient from './ArchiveClient';

export default async function ArchivePage() {
  let profile = { scraps: [] };
  try {
    const token = process.env.GITHUB_PAT;
    const repo = process.env.GITHUB_REPO;
    
    if (token && repo) {
      const apiUrl = `https://api.github.com/repos/${repo}/contents/mose-app/src/data/user_profile.json`;
      const res = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
        },
        cache: 'no-store'
      });
      
      if (res.ok) {
        const data = await res.json();
        const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
        profile = JSON.parse(decoded);
      }
    }
    
    // Fallback: API 실패 시 로컬 읽기
    if (!profile.scraps || profile.scraps.length === 0) {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(process.cwd(), 'src', 'data', 'user_profile.json');
      profile = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (error) {
    console.error('Failed to load user profile in archive', error);
  }

  // 데이터만 읽어서 클라이언트 컴포넌트로 넘김 (삭제 버튼 동작을 위해)
  return <ArchiveClient initialScraps={profile.scraps || []} />;
}
