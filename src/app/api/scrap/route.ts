import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST(req: Request) {
  try {
    const newsItem = await req.json();
    const token = process.env.GITHUB_PAT;
    const repo = process.env.GITHUB_REPO;
    const isDev = process.env.NODE_ENV === 'development';
    
    // 로컬 환경이거나 GitHub 인증 정보가 없을 경우 로컬 파일시스템에 직접 저장
    if (isDev || !token || !repo) {
      const localPath = path.join(process.cwd(), 'src', 'data', 'user_profile.json');
      let currentData: { scraps: any[] } = { scraps: [] };
      try {
        const fileContent = await fs.readFile(localPath, 'utf-8');
        currentData = JSON.parse(fileContent);
      } catch (e) {
        // 파일이 없거나 파싱 실패 시 기본값 유지
      }
      if (!currentData.scraps) currentData.scraps = [];
      currentData.scraps.unshift({ ...newsItem, scrapedAt: new Date().toISOString() });
      await fs.writeFile(localPath, JSON.stringify(currentData, null, 2), 'utf-8');
      return NextResponse.json({ success: true, local: true });
    }

    const filePath = 'mose-app/src/data/user_profile.json';
    const apiUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;
    
    const getRes = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      cache: 'no-store'
    });
    
    if (!getRes.ok) throw new Error('Failed to get file from GitHub');
    const getJson = await getRes.json();
    const currentData = JSON.parse(Buffer.from(getJson.content, 'base64').toString('utf-8'));
    
    if (!currentData.scraps) currentData.scraps = [];
    currentData.scraps.unshift({ 
      ...newsItem, 
      scrapedAt: new Date().toISOString() 
    });
    
    const contentEncoded = Buffer.from(JSON.stringify(currentData, null, 2), 'utf-8').toString('base64');
    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({
        message: 'Scrap news item via UI',
        content: contentEncoded,
        sha: getJson.sha
      })
    });

    if (!putRes.ok) throw new Error('Failed to save to GitHub');

    return NextResponse.json({ success: true, local: false });
  } catch (error) {
    console.error('Scrap API Error:', error);
    return NextResponse.json({ error: 'Failed to scrap news' }, { status: 500 });
  }
}

