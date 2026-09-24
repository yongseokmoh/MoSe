import Layout from '@/components/Layout';
import MacroSummaryClient from '@/components/MacroSummaryClient';

export default function Home({ searchParams }: { searchParams: { ai?: string } }) {
  const isDeepSeek = searchParams.ai === 'ds';
  return (
    <Layout>
      <MacroSummaryClient isDeepSeek={isDeepSeek} />
    </Layout>
  );
}
