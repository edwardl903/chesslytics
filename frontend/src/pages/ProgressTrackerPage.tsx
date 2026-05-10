import ComingSoonPage from './ComingSoonPage';

export default function ProgressTrackerPage() {
  return (
    <ComingSoonPage
      title="Progress Tracker"
      subtitle="Track your chess improvement over time with detailed analytics"
      bulletsHeading="Coming Soon! This feature will include:"
      bullets={[
        'Rating progression charts',
        'Performance metrics over time',
        'Goal setting and tracking',
        'Improvement recommendations',
      ]}
    />
  );
}
