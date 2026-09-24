import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const data = await req.json();
    
    // 이 토큰은 GitHub 저장소에 쓰기 권한이 있는 대표님의 Personal Access Token (PAT) 입니다.
    const token = process.env.GITHUB_PAT;
    const repo = process.env.GITHUB_REPO; // ex: yongseokmoh/MoSe
    
    if (!token || !repo) {
      console.warn("GitHub PAT or REPO is missing in environment variables.");
      return NextResponse.json({ error: 'GitHub credentials missing' }, { status: 500 });
    }

    const filePath = 'mose-app/src/data/user_profile.json';
    const apiUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;
    
    // 1. 현재 파일의 SHA 값 가져오기 (GitHub API에서 덮어쓰기 할 때 필수)
    const getRes = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      cache: 'no-store' // 항상 최신 데이터를 가져옴
    });
    
    let sha = '';
    if (getRes.ok) {
      const getJson = await getRes.json();
      sha = getJson.sha;
    }

    // 2. 파일 업데이트 (base64 인코딩 필수)
    const contentEncoded = Buffer.from(JSON.stringify(data, null, 2), 'utf-8').toString('base64');
    
    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({
        message: 'Auto-update user_profile.json via MoSe App UI',
        content: contentEncoded,
        ...(sha && { sha }) // sha가 있으면 덮어쓰기
      })
    });

    if (!putRes.ok) {
      const err = await putRes.text();
      console.error(err);
      throw new Error('Failed to update file on GitHub');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
