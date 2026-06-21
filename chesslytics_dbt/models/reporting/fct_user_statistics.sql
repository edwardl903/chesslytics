{{
    config(
        materialized='incremental',
        unique_key='stat_key',
        incremental_strategy='merge',
        merge_update_columns=[
            'games_played', 'wins', 'losses', 'draws',
            'avg_accuracy', 'avg_rating', 'max_rating', 'min_rating',
            'closing_rating', 'total_games', 'total_wins', 'current_rating',
            'highest_rating_ever', 'fact_updated_at'
        ],
        partition_by={
            'field': 'stat_date',
            'data_type': 'date',
            'granularity': 'month'
        },
        cluster_by=['username', 'time_class']
    )
}}

/*
  Fact table: daily per-user per-time-class statistics.

  Grain: (username × stat_date × time_class)

  Includes both daily counts and cumulative totals so Looker can simply
  filter without needing window functions at query time.

  Incremental: only compute new stat_date values not already in the table.
  On full-refresh: recomputes everything from int_player_games.
*/

WITH daily AS (

    SELECT
        my_username                                 AS username,
        game_date                                   AS stat_date,
        time_class,
        COUNT(*)                                    AS games_played,
        COUNTIF(outcome = 'win')                    AS wins,
        COUNTIF(outcome = 'lose')                   AS losses,
        COUNTIF(outcome = 'draw')                   AS draws,
        AVG(my_accuracy)                            AS avg_accuracy,
        AVG(my_rating)                              AS avg_rating,
        MAX(my_rating)                              AS max_rating,
        MIN(my_rating)                              AS min_rating,
        -- Rating at end of day = rating on the last game of the day
        MAX_BY(my_rating, game_end_timestamp)       AS closing_rating

    FROM {{ ref('int_player_games') }}

    WHERE my_username IS NOT NULL

    {% if is_incremental() %}
        -- Only process dates newer than what we already have
        AND game_date > (
            SELECT COALESCE(MAX(stat_date), DATE('1970-01-01'))
            FROM {{ this }}
        )
    {% endif %}

    GROUP BY username, stat_date, time_class

),

cumulative AS (

    SELECT
        *,

        SUM(games_played) OVER (
            PARTITION BY username, time_class
            ORDER BY stat_date
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cumulative_games,

        SUM(wins) OVER (
            PARTITION BY username, time_class
            ORDER BY stat_date
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cumulative_wins,

        closing_rating AS current_rating,

        MAX(max_rating) OVER (
            PARTITION BY username, time_class
            ORDER BY stat_date
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS highest_rating_ever,

        CURRENT_TIMESTAMP() AS fact_updated_at

    FROM daily

)

SELECT
    {{ dbt_utils.generate_surrogate_key(['c.username', 'c.stat_date', 'c.time_class']) }} AS stat_key,
    du.user_key,
    c.username,
    c.stat_date,
    c.time_class,
    c.games_played,
    c.wins,
    c.losses,
    c.draws,
    ROUND(c.avg_accuracy, 2)         AS avg_accuracy,
    ROUND(c.avg_rating, 1)           AS avg_rating,
    c.max_rating,
    c.min_rating,
    c.closing_rating,
    c.cumulative_games               AS total_games,
    c.cumulative_wins                AS total_wins,
    c.current_rating,
    c.highest_rating_ever,
    c.fact_updated_at

FROM cumulative c
LEFT JOIN {{ ref('dim_users') }} du
    ON c.username = du.username
