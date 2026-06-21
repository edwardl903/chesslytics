{% macro win_rate(wins_col, total_col, decimals=4) %}
{#
  Safe win-rate calculation — returns NULL instead of dividing by zero.

  Usage:
    {{ win_rate('wins', 'games_played') }}              -- 4 decimal places
    {{ win_rate('cumulative_wins', 'total_games', 2) }} -- 2 decimal places
#}
CASE
    WHEN {{ total_col }} = 0 THEN NULL
    ELSE ROUND(SAFE_DIVIDE({{ wins_col }}, CAST({{ total_col }} AS FLOAT64)), {{ decimals }})
END
{% endmacro %}
