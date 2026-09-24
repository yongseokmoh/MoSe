import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { scrapedAt } = await req.json(); // 고유 식별자로 스크랩된 시간 사용
    
    const token = process.env.GITHUB_PAT;
    const repo = process.env.GITHUB_REPO;
    
    if (!token || !repo) return NextResponse.json({ error: 'GitHub credentials missing' }, { status: 500 });

    const filePath = 'mose-app/src/data/user_profile.json';
    const apiUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;
    
    const getRes = await fetch(apiUrl, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      cache: 'no-store'
    });
    
    if (!getRes.ok) throw new Error('Failed to get file from GitHub');
    const getJson = await getRes.json();
    const currentData = JSON.parse(Buffer.from(getJson.content, 'base64').toString('utf-8'));
    
    // 해당 뉴스 삭제
    if (currentData.scraps) {
      currentData.scraps = currentData.scraps.filter((s: any) => s.scrapedAt !== scrapedAt);
    }
    
    const contentEncoded = Buffer.from(JSON.stringify(currentData, null, 2), 'utf-8').toString('base64');
    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      body: JSON.stringify({ message: 'Remove scrap via UI', content: contentEncoded, sha: getJson.sha })
    });

    if (!putRes.ok) throw new Error('Failed to save to GitHub');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to unscrap news' }, { status: 500 });
  }
}
