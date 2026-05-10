interface Props {
  title: string;
  subtitle: string;
  bullets: string[];
  bulletsHeading?: string;
}

/**
 * Reusable "Coming Soon" page chrome shared by Opening Analyzer, Progress
 * Tracker, and Game Analyzer. Mirrors the original markup so the existing
 * styles continue to apply.
 */
export default function ComingSoonPage({
  title,
  subtitle,
  bullets,
  bulletsHeading = 'Coming Soon! This feature will allow you to:',
}: Props) {
  return (
    <div
      className="page-content"
      style={{
        textAlign: 'center',
        color: '#EEEED5',
        fontFamily: "'League Spartan', sans-serif",
        padding: '50px 20px',
      }}
    >
      <h1 style={{ fontSize: 48, marginBottom: 30 }}>{title}</h1>
      <p style={{ fontSize: 20, marginBottom: 40 }}>{subtitle}</p>
      <div
        style={{
          background: 'rgba(238, 238, 213, 0.1)',
          padding: 30,
          borderRadius: 10,
          maxWidth: 600,
          margin: '0 auto',
        }}
      >
        <p style={{ fontSize: 18, color: '#EEEED5' }}>{bulletsHeading}</p>
        <ul style={{ textAlign: 'left', fontSize: 16, marginTop: 20 }}>
          {bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
