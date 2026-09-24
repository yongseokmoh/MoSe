import fs from 'fs';
import path from 'path';
import SettingsClient from './SettingsClient';

export default function SettingsPage() {
  // 서버 사이드에서 로컬 JSON 파일을 읽어서 초기 데이터로 클라이언트에 넘깁니다.
  let initialProfile = { stocks: [], scraps: [] };
  try {
    const filePath = path.join(process.cwd(), 'src', 'data', 'user_profile.json');
    const fileContents = fs.readFileSync(filePath, 'utf8');
    initialProfile = JSON.parse(fileContents);
  } catch (error) {
    console.error('Failed to load user profile in settings');
  }

  return <SettingsClient initialProfile={initialProfile} />;
}
