{{
    config(
        materialized='incremental',
        unique_key='player_game_key',
        incremental_strategy='merge',
        merge_update_columns=['outcome', 'my_result', 'my_accuracy', 'opp_accuracy'],
        partition_by={
            'field': 'game_date',
            'data_type': 'date',
            'granularity': 'month'
        },
        cluster_by=['time_class', 'game_date']
    )
}}

/*
  Portfolio model: EdwardL903's games only.

  Pre-filtered from fct_games so the portfolio API never has to scan
  the full multi-user fact table. All columns from fct_games are kept
  so the portfolio site can slice any way it needs.

  Incremental — merges on player_game_key watermarked by loaded_at.
*/

SELECT *
FROM {{ ref('fct_games') }}
WHERE LOWER(my_username) = 'edwardl903'

{% if is_incremental() %}
    AND loaded_at > (
        SELECT COALESCE(MAX(loaded_at), TIMESTAMP('1970-01-01'))
        FROM {{ this }}
    )
{% endif %}
