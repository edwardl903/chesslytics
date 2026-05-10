import type { StatsResponse } from '@/types/stats';

interface Props {
  data: StatsResponse;
}

/**
 * The 3 rows of summary stats displayed under the profile header. Pure
 * read-from-props presentational component; no state.
 */
export default function StatGrid({ data }: Props) {
  const opponents = data.most_played_opponent;

  return (
    <>
      <div className="row row-1">
        <div className="stat-box">
          <div className="stat-title">TOTAL GAMES</div>
          <div className="stat-value">{data.total_games}</div>
          <div className="stat-details">
            {data.total_win_draw_loss.win} wins / {data.total_win_draw_loss.draw} draws /{' '}
            {data.total_win_draw_loss.lose} losses
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-title">MINUTES PLAYED</div>
          <div className="stat-value">
            {data.total_time_spent.total_time_in_minutes.toFixed(2)}
          </div>
          <div className="stat-details">that's {data.total_time_spent.total_time}!</div>
        </div>
        <div className="stat-box">
          <div className="stat-title">YOUR HIGHEST RATING</div>
          <div className="stat-value">{data.highest_rating.rating}</div>
          <div className="stat-details">
            in {data.highest_rating.time_control} chess, on {data.highest_rating.date}
          </div>
        </div>
      </div>

      <div className="row row-2">
        <div className="stat-box">
          <div className="stat-title">MOST PLAYED OPPONENTS</div>
          {(['0', '1', '2'] as const).map((idx) => {
            const opp = opponents.Opponent[idx];
            const games = opponents.Games_Played[idx];
            if (!opp) return null;
            return (
              <div className="stat-opponent" key={idx}>
                @{opp} ({games} games)
              </div>
            );
          })}
        </div>
        <div className="stat-box">
          <div className="stat-title">MOST PLAYED OPENINGS</div>
          <div className="stat-opening">White Opening: {data.my_openings.white_opening}</div>
          <div className="stat-opening">Black Opening: {data.my_openings.black_opening}</div>
        </div>
      </div>

      <div className="row row-3">
        <div className="stat-box">
          <div className="stat-title">FAVORITE TIME CONTROL</div>
          <div className="stat-value">{data.timecontrol_counts.Time_Control['0']}</div>
          <div className="stat-details">
            ({data.timecontrol_counts.Games_Played['0']} games)
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-title">LONGEST WINNING STREAK</div>
          <div className="stat-value">{data.longest_winning_streak}</div>
        </div>
        <div className="stat-box">
          <div className="stat-title">LONGEST LOSING STREAK</div>
          <div className="stat-value">{data.longest_losing_streak}</div>
        </div>
        <div className="stat-box">
          <div className="stat-title">MOST HOURS PLAYED IN ONE DAY</div>
          <div className="stat-details">
            {data.most_time_spent_day_dict.date}: {data.most_time_spent_day_dict.time_spent}
          </div>
        </div>
      </div>
    </>
  );
}
