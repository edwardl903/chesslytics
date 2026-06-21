/*
  Analysis: Monthly rating progression for all tracked users

  Shows how each user's rating changes month over month per time class.
  Good for portfolio charts — run in BigQuery and pipe to a frontend.
*/

SELECT
    fus.username,
    fus.time_class,
    DATE_TRUNC(fus.stat_date, MONTH)           AS month,
    MAX(fus.current_rating)                    AS end_of_month_rating,
    MAX(fus.highest_rating_ever)               AS peak_rating_to_date,
    SUM(fus.games_played)                      AS games_that_month,
    SUM(fus.wins)                              AS wins_that_month,
    {{ win_rate('SUM(fus.wins)', 'SUM(fus.games_played)') }} AS monthly_win_rate

FROM {{ ref('fct_user_statistics') }} fus

INNER JOIN {{ ref('tracked_usernames') }} tu
    ON LOWER(fus.username) = LOWER(tu.username)

WHERE fus.time_class IN ('blitz', 'rapid', 'bullet')

GROUP BY fus.username, fus.time_class, DATE_TRUNC(fus.stat_date, MONTH)
ORDER BY fus.username, fus.time_class, month DESC
