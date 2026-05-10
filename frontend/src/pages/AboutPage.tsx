export default function AboutPage() {
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
      <h1 style={{ fontSize: 48, marginBottom: 30 }}>About ChessLytics</h1>
      <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'left' }}>
        <p style={{ fontSize: 18, marginBottom: 20, lineHeight: 1.6 }}>
          ChessLytics is your comprehensive chess analytics platform designed to help you
          understand and improve your chess game. Whether you're a beginner looking to track your
          progress or an advanced player seeking detailed insights, our tools provide the data you
          need to elevate your chess performance.
        </p>
        <p style={{ fontSize: 18, marginBottom: 20, lineHeight: 1.6 }}>
          Our platform analyzes your Chess.com games to provide personalized insights, track your
          improvement over time, and help you identify areas for growth. From opening analysis to
          endgame patterns, ChessLytics gives you the competitive edge you need.
        </p>
        <div
          style={{
            background: 'rgba(238, 238, 213, 0.1)',
            padding: 30,
            borderRadius: 10,
            marginTop: 30,
          }}
        >
          <h3 style={{ fontSize: 24, marginBottom: 20, textAlign: 'center' }}>Features</h3>
          <ul style={{ fontSize: 16, lineHeight: 1.8 }}>
            <li>
              <strong>Year in Review:</strong> Get your personalized chess wrapped with
              comprehensive yearly statistics
            </li>
            <li>
              <strong>Opening Analyzer:</strong> Analyze your opening performance and discover
              patterns
            </li>
            <li>
              <strong>Progress Tracker:</strong> Monitor your improvement over time with detailed
              metrics
            </li>
            <li>
              <strong>Game Analyzer:</strong> Deep dive into individual games with advanced analysis
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
