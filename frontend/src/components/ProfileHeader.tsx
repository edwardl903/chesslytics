import type { LastGameRatings } from '@/types/stats';
import { formatWrappedBannerYear } from '@/lib/yearLabel';

interface Props {
  username: string;
  avatar: string;
  year: string;
  lastGameRatings: LastGameRatings;
}

function latestRating(series: LastGameRatings, key: string): number | string {
  const points = series[key];
  if (!points || points.length === 0) return 'N/A';
  return points[0].my_rating;
}

export default function ProfileHeader({ username, avatar, year, lastGameRatings }: Props) {
  return (
    <header className="profile-header">
      <h2 className="stats-header-title">
        @{username}&apos;s {formatWrappedBannerYear(year)} Chess.com Wrapped
      </h2>
      <div className="profile-header-body">
        <img className="profile-avatar" src={avatar} alt={`${username}'s avatar`} width={100} height={100} />
        <div className="profile-ratings-grid" role="list" aria-label="Latest ratings by time control">
          {(['bullet', 'blitz', 'rapid'] as const).map((tc) => (
            <div key={tc} className="stat-box profile-rating-box" role="listitem">
              <div className="stat-title">{tc.toUpperCase()}</div>
              <div className="stat-value">{latestRating(lastGameRatings, tc)}</div>
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}
