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
    <div className="row row-0 row-profile">
      <div className="stat-box no-bg center">
        <div className="stat-title stats-header-title">
          @{username}'s {formatWrappedBannerYear(year)} CHESS.COM WRAPPED
        </div>
        <div className="profile-stats-container profile-stats-container-custom">
          <img className="profile-avatar" src={avatar} alt={`${username}'s avatar`} />
          <div className="row profile-ratings-row">
            <div className="stat-box profile-rating-box">
              <div className="stat-title">BULLET</div>
              <div className="stat-value">{latestRating(lastGameRatings, 'bullet')}</div>
            </div>
            <div className="stat-box profile-rating-box">
              <div className="stat-title">BLITZ</div>
              <div className="stat-value">{latestRating(lastGameRatings, 'blitz')}</div>
            </div>
            <div className="stat-box profile-rating-box">
              <div className="stat-title">RAPID</div>
              <div className="stat-value">{latestRating(lastGameRatings, 'rapid')}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
