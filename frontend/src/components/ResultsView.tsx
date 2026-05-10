import { useEffect, useRef } from 'react';
import type { StatsResponse } from '@/types/stats';
import ProfileHeader from './ProfileHeader';
import StatGrid from './StatGrid';
import BiggestGames from './BiggestGames';
import DashboardEmbed from './DashboardEmbed';
import DownloadShareButtons from './DownloadShareButtons';

interface Props {
  data: StatsResponse;
  year: string;
}

export default function ResultsView({ data, year }: Props) {
  const captureRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <div className="result" id="result" ref={scrollRef}>
      <div className="stats-container">
        <div className="export-strip">
          <p className="export-strip-caption">
            Share your wrapped card. Download and share capture the summary stats only (not game
            highlights or the dashboard below).
          </p>
          <DownloadShareButtons targetRef={captureRef} username={data.my_username} year={year} />
        </div>

        <div className="stats-capture-target">
          <div className="background-overlay" aria-hidden />
          <div className="background-overlay-second" aria-hidden />

          {/* ref only on stats slice so html2canvas cannot pick up siblings (e.g. highlights) */}
          <div ref={captureRef} className="stats-capture-inner">
            <ProfileHeader
              username={data.my_username}
              avatar={data.my_avatar}
              year={year}
              lastGameRatings={data.last_game_ratings}
            />

            <StatGrid data={data} />
          </div>
        </div>

        <section className="stats-highlights-section" aria-label="Notable games">
          <BiggestGames games={data.biggest_games} />
        </section>

        <DashboardEmbed
          dashboardUrl={data.personalized_dashboard_url}
          embedConfig={data.embed_config}
        />
      </div>
    </div>
  );
}
