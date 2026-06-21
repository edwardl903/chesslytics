{{
    config(
        materialized='incremental',
        unique_key='player_game_key',
        incremental_strategy='merge',
        merge_update_columns=[
            'my_accuracy',
            'opp_accuracy',
            'outcome',
            'my_result',
            'opp_result'
        ],
        partition_by={
            'field': 'game_date',
            'data_type': 'date',
            'granularity': 'month'
        },
        cluster_by=['my_username', 'time_class']
    )
}}

/*
  Fact table: one row per (game, player).

  Incremental strategy: merge on player_game_key.
  On first run: full load from int_player_games.
  On subsequent runs: only process rows where uploaded_at is newer than
  the latest loaded_at already in the table.

  Grain: (game_id × my_username)
  Partitioned by game_date month, clustered by my_username + time_class
  for fast Looker queries like "all EdwardL903 blitz games in 2026".
*/

WITH source AS (

    SELECT * FROM {{ ref('int_player_games') }}

    {% if is_incremental() %}
        -- Only pick up rows added since the last dbt run
        WHERE uploaded_at > (
            SELECT COALESCE(MAX(loaded_at), TIMESTAMP('1970-01-01'))
            FROM {{ this }}
        )
    {% endif %}

)

SELECT
    -- ── Keys ─────────────────────────────────────────────────────────
    player_game_key,
    game_id,

    -- ── User FK ───────────────────────────────────────────────────────
    du.user_key,
    src.my_username,

    -- ── Time ─────────────────────────────────────────────────────────
    src.game_end_timestamp,
    src.game_date,
    src.game_year,
    src.game_month,
    src.game_day,
    src.game_hour,
    src.game_day_of_week,
    src.game_weekday_name,

    -- ── Game settings ─────────────────────────────────────────────────
    src.time_class,
    src.raw_time_control,
    src.rules,
    src.rated,

    -- ── Player perspective ─────────────────────────────────────────────
    src.my_color,
    src.my_rating,
    src.my_result,
    src.my_accuracy,
    src.my_opening,
    src.eco,

    -- ── Opponent ──────────────────────────────────────────────────────
    src.opp_username,
    src.opp_rating,
    src.opp_result,
    src.opp_accuracy,

    -- ── Metrics ───────────────────────────────────────────────────────
    src.outcome,
    src.rating_diff,

    -- ── Dashboard filter key ──────────────────────────────────────────
    src.username_year,

    -- ── Metadata ──────────────────────────────────────────────────────
    src.uploaded_at AS loaded_at,
    CURRENT_TIMESTAMP() AS fact_updated_at

FROM source src
LEFT JOIN {{ ref('dim_users') }} du
    ON src.my_username = du.username
