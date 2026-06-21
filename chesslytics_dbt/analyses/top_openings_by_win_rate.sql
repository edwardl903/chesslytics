/*
  Analysis: Top openings by win rate for each tracked user

  Not a model — this is an ad-hoc query that can be run with:
    dbt compile --select top_openings_by_win_rate
    (then paste the compiled SQL into BigQuery)

  Or run directly against fct_games in BigQuery console.
*/

WITH opening_stats AS (

    SELECT
        my_username,
        time_class,
        my_opening,
        COUNT(*)                                   AS games_played,
        COUNTIF(outcome = 'win')                   AS wins,
        COUNTIF(outcome = 'draw')                  AS draws,
        COUNTIF(outcome = 'lose')                  AS losses,
        {{ win_rate('COUNTIF(outcome = \'win\')', 'COUNT(*)') }} AS win_rate,
        AVG(my_rating)                             AS avg_rating_when_played,
        MAX(game_date)                             AS last_played

    FROM {{ ref('fct_games') }}

    WHERE
        my_opening != 'N/A'
        AND my_opening IS NOT NULL
        AND time_class IN ('blitz', 'rapid', 'bullet')

    GROUP BY my_username, time_class, my_opening
    HAVING COUNT(*) >= 10   -- minimum sample size

),

ranked AS (

    SELECT
        *,
        ROW_NUMBER() OVER (
            PARTITION BY my_username, time_class
            ORDER BY win_rate DESC, games_played DESC
        ) AS rank_by_win_rate

    FROM opening_stats

)

SELECT
    my_username,
    time_class,
    rank_by_win_rate,
    my_opening,
    games_played,
    wins,
    draws,
    losses,
    win_rate,
    ROUND(avg_rating_when_played) AS avg_rating,
    last_played
FROM ranked
WHERE rank_by_win_rate <= 5
ORDER BY my_username, time_class, rank_by_win_rate
