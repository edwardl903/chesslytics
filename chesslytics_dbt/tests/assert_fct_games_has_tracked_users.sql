{{ config(severity='warn') }}

-- Singular test (warn only): every username in tracked_usernames should
-- have at least one row in fct_games. Warns — not errors — because newly
-- added users won't have data until the daily ingest runs for the first time.
-- Promote to severity='error' once all users have been fully backfilled.

SELECT tu.username
FROM {{ ref('tracked_usernames') }} tu
LEFT JOIN {{ ref('fct_games') }} fg ON LOWER(tu.username) = LOWER(fg.my_username)
WHERE fg.my_username IS NULL
