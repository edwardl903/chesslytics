import ComingSoonPage from './ComingSoonPage';

export default function OpeningAnalyzerPage() {
  return (
    <ComingSoonPage
      title="Opening Analyzer"
      subtitle="Analyze your opening performance and discover your strengths and weaknesses"
      bullets={[
        'Analyze your win rates with different openings',
        'Compare performance as White vs Black',
        'Track opening trends over time',
        'Get personalized opening recommendations',
      ]}
    />
  );
}
