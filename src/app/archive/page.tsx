import fs from 'fs';
import path from 'path';
import ArchiveClient from './ArchiveClient';

export default function ArchivePage() {
  let profile = { scraps: [] };
  try {
    const filePath = path.join(process.cwd(), 'src', 'data', 'user_profile.json');
    const fileContents = fs.readFileSync(filePath, 'utf8');
    profile = JSON.parse(fileContents);
  } catch (error) {
    console.error('Failed to load user profile in archive');
  }

  // 데이터만 읽어서 클라이언트 컴포넌트로 넘김 (삭제 버튼 동작을 위해)
  return <ArchiveClient initialScraps={profile.scraps || []} />;
}
