import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const newsItem = await req.json();
    
    const token = process.env.GITHUB_PAT;
    const repo = process.env.GITHUB_REPO;
    
    if (!token || !repo) {
      return NextResponse.json({ error: 'GitHub credentials missing' }, { status: 500 });
    }

    const filePath = 'mose-app/src/data/user_profile.json';
    const apiUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;
    
    // 1. 현재 user_profile.json 파일 가져오기
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
    
    // base64로 인코딩된 파일 내용을 디코딩
    const currentData = JSON.parse(Buffer.from(getJson.content, 'base64').toString('utf-8'));
    
    // 2. 스크랩 배열에 새 뉴스 추가 (최신순)
    if (!currentData.scraps) currentData.scraps = [];
    currentData.scraps.unshift({ 
      ...newsItem, 
      scrapedAt: new Date().toISOString() 
    });
    
    // 3. 업데이트된 데이터를 다시 base64로 인코딩하여 GitHub에 Push
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to scrap news' }, { status: 500 });
  }
}
