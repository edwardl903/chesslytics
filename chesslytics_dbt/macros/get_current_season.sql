{% macro get_current_season() %}
{#
  Returns a human-readable "season" label for the current month.
  Used in analyses and BI reports to group data by season without
  hardcoding year values in queries.

  Example output: '2026-Q2', '2026-Q3', etc.

  Usage:
    SELECT {{ get_current_season() }} AS current_season
#}
CONCAT(
    CAST(EXTRACT(YEAR FROM CURRENT_DATE()) AS STRING),
    '-Q',
    CAST(CEILING(EXTRACT(MONTH FROM CURRENT_DATE()) / 3) AS STRING)
)
{% endmacro %}
