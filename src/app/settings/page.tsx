import SettingsClient from './SettingsClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  // 서버 사이드에서 GitHub API를 통해 최신 JSON 파일을 읽어옵니다.
  let initialProfile = { stocks: [], scraps: [] };
  try {
    const token = process.env.GITHUB_PAT;
    const repo = process.env.GITHUB_REPO; // ex: yongseokmoh/MoSe
    
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
        initialProfile = JSON.parse(decoded);
      } else {
        console.warn("GitHub API load failed, falling back to local file.");
      }
    }
    
    // Fallback: GitHub 토큰이 없거나 API 호출 실패 시 로컬 파일 읽기
    if (initialProfile.stocks.length === 0) {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(process.cwd(), 'src', 'data', 'user_profile.json');
      initialProfile = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (error) {
    console.error('Failed to load user profile in settings', error);
  }

  return <SettingsClient initialProfile={initialProfile} />;
}
