import ComingSoonPage from './ComingSoonPage';

export default function GameAnalyzerPage() {
  return (
    <ComingSoonPage
      title="Game Analyzer"
      subtitle="Deep dive into individual games with advanced analysis"
      bulletsHeading="Coming Soon! This feature will provide:"
      bullets={[
        'Move-by-move analysis',
        'Blunder detection',
        'Position evaluation',
        'Game replay with annotations',
      ]}
    />
  );
}
