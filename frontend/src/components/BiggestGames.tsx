import type { BiggestGames } from '@/types/stats';

interface Props {
  games: BiggestGames;
}

interface CardProps {
  emoji: string;
  title: string;
  username: string;
  rating: number;
  timeClass: string;
  date: string;
  link: string;
  ctaEmoji: string;
  /** Optional extra detail line (e.g. "12s | 8 moves"). */
  extra?: string;
  bgOpacity: number;
}

const SECTION_HEADER_STYLE: React.CSSProperties = {
  background: 'linear-gradient(135deg, #2D6056 0%, #4A7C59 100%)',
  padding: 15,
  borderRadius: 10,
  margin: '30px 0 20px 0',
  textAlign: 'center',
  fontSize: 24,
  color: '#EEEED5',
  textShadow: '2px 2px 4px rgba(0,0,0,0.3)',
  boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
};

const LINK_CLASS = 'highlight-game-link';

function HighlightCard({
  emoji,
  title,
  username,
  rating,
  timeClass,
  date,
  link,
  ctaEmoji,
  extra,
  bgOpacity,
}: CardProps) {
  return (
    <div
      className="stat-box2"
      style={{
        background: `linear-gradient(135deg, rgba(45, 96, 86, ${bgOpacity}) 0%, rgba(74, 124, 89, ${bgOpacity}) 100%)`,
        border: '2px solid #EEEED5',
        boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
        position: 'relative',
        overflow: 'hidden',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div style={{ position: 'absolute', top: 10, right: 10, fontSize: 24 }}>{emoji}</div>
      <div
        className="stat-title"
        style={{ color: '#EEEED5', fontSize: 18, fontWeight: 700, marginBottom: 10 }}
      >
        {title}
      </div>
      <div
        className="stat-opponent"
        style={{ fontSize: 16, fontWeight: 600, color: '#EEEED5', marginBottom: 8 }}
      >
        @{username}
      </div>
      <div
        className="stat-details"
        style={{ fontSize: 14, color: '#EEEED5', marginBottom: 6 }}
      >
        Rating: {rating} | {timeClass}
      </div>
      {extra && (
        <div
          className="stat-details"
          style={{ fontSize: 14, color: '#EEEED5', marginBottom: 6 }}
        >
          {extra}
        </div>
      )}
      <div
        className="stat-date"
        style={{ fontSize: 12, color: '#EEEED5', marginBottom: 10 }}
      >
        {date}
      </div>
      <a href={link} target="_blank" rel="noopener noreferrer" className={`stat-link ${LINK_CLASS}`}>
        {ctaEmoji} View Game
      </a>
    </div>
  );
}

export default function BiggestGamesSection({ games }: Props) {
  return (
    <>
      <div className="stat-title stat-section-header" style={SECTION_HEADER_STYLE}>
        🏆 SPECIAL GAME HIGHLIGHTS 🏆
      </div>

      <div className="row row-2" style={{ marginBottom: 20 }}>
        <HighlightCard
          emoji="🥇"
          title="BIGGEST VICTORY"
          username={games.victory.opp_username}
          rating={games.victory.opp_rating}
          timeClass={games.victory.time_class}
          date={games.victory.date}
          link={games.victory.link}
          ctaEmoji="🎯"
          bgOpacity={0.9}
        />
        <HighlightCard
          emoji="😱"
          title="BIGGEST UPSET"
          username={games.upset.opp_username}
          rating={games.upset.opp_rating}
          timeClass={games.upset.time_class}
          date={games.upset.date}
          link={games.upset.link}
          ctaEmoji="⚡"
          bgOpacity={0.8}
        />
      </div>

      <div className="row row-2" style={{ marginBottom: 20 }}>
        <HighlightCard
          emoji="⚔️"
          title="QUICKEST CHECKMATE"
          username={games.checkmate.opp_username}
          rating={games.checkmate.opp_rating}
          timeClass={games.checkmate.time_class}
          date={games.checkmate.date}
          link={games.checkmate.link}
          ctaEmoji="🗡️"
          extra={`⏱️ ${games.checkmate.time_spent}s | 🎯 ${games.checkmate.my_num_moves} moves`}
          bgOpacity={0.7}
        />
        <HighlightCard
          emoji="👑"
          title="HIGHEST RATED OPPONENT"
          username={games.opponent.opp_username}
          rating={games.opponent.opp_rating}
          timeClass={games.opponent.time_class}
          date={games.opponent.date}
          link={games.opponent.link}
          ctaEmoji="👑"
          bgOpacity={0.6}
        />
      </div>

      <div className="row row-2" style={{ marginBottom: 20 }}>
        <HighlightCard
          emoji="⏰"
          title="LONGEST GAME"
          username={games.longest.opp_username}
          rating={games.longest.opp_rating}
          timeClass={games.longest.time_class}
          date={games.longest.date}
          link={games.longest.link}
          ctaEmoji="⏰"
          extra={`⏱️ ${games.longest.time_spent} seconds`}
          bgOpacity={0.5}
        />
        <HighlightCard
          emoji="🎲"
          title="MOST MOVES GAME"
          username={games.moves.opp_username}
          rating={games.moves.opp_rating}
          timeClass={games.moves.time_class}
          date={games.moves.date}
          link={games.moves.link}
          ctaEmoji="🎲"
          extra={`🎯 ${games.moves.my_num_moves} moves`}
          bgOpacity={0.4}
        />
      </div>

      <div className="row row-2" style={{ marginBottom: 20 }}>
        <HighlightCard
          emoji="🔥"
          title="MOST INTENSE GAME"
          username={games.least_time_won.opp_username}
          rating={games.least_time_won.opp_rating}
          timeClass={games.least_time_won.time_class}
          date={games.least_time_won.date}
          link={games.least_time_won.link}
          ctaEmoji="🔥"
          extra={`⏱️ ${games.least_time_won.my_time_left}s left`}
          bgOpacity={0.3}
        />
        <HighlightCard
          emoji="😔"
          title="MOST DISAPPOINTING GAME"
          username={games.least_time_lost.opp_username}
          rating={games.least_time_lost.opp_rating}
          timeClass={games.least_time_lost.time_class}
          date={games.least_time_lost.date}
          link={games.least_time_lost.link}
          ctaEmoji="😔"
          extra={`⏱️ ${games.least_time_lost.opp_time_left}s left`}
          bgOpacity={0.2}
        />
      </div>
    </>
  );
}
