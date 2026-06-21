-- Singular test: for every (username, stat_date, time_class) row in
-- fct_user_statistics, wins + losses + draws must equal games_played.
-- Catches logic bugs in outcome classification.

SELECT
    username,
    stat_date,
    time_class,
    games_played,
    wins,
    losses,
    draws,
    (wins + losses + draws) AS wld_sum
FROM {{ ref('fct_user_statistics') }}
WHERE (wins + losses + draws) != games_played
