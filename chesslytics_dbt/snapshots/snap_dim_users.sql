{% snapshot snap_dim_users %}

{{
    config(
        target_schema='test1',
        unique_key='user_key',
        strategy='check',
        check_cols=[
            'current_rating',
            'peak_rating',
            'total_games',
            'win_rate',
            'blitz_games',
            'rapid_games',
            'bullet_games',
        ]
    )
}}

/*
  SCD Type 2 snapshot of dim_users.

  Every time a tracked column changes (e.g. current_rating goes up after a
  new game is played), dbt snapshots writes a new row with updated dbt_valid_from
  and sets dbt_valid_to on the old row.

  This lets you answer: "What was EdwardL903's rating on 2026-04-01?"
  without scanning fct_games for that date.

  Query current state:
    SELECT * FROM test1.snap_dim_users WHERE dbt_valid_to IS NULL

  Query historical state at a date:
    SELECT * FROM test1.snap_dim_users
    WHERE dbt_valid_from <= '2026-04-01'
      AND (dbt_valid_to IS NULL OR dbt_valid_to > '2026-04-01')
*/

SELECT * FROM {{ ref('dim_users') }}

{% endsnapshot %}
