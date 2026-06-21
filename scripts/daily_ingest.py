"""
daily_ingest.py — Chesslytics nightly pipeline

Fetches new games from Chess.com for every username in TRACKED_USERNAMES,
uploads them incrementally to BigQuery raw_games, then logs a pipeline_run
audit row. Designed to be triggered by GitHub Actions on a daily cron.

Usage:
    python scripts/daily_ingest.py                     # all usernames
    python scripts/daily_ingest.py EdwardL903 hikaru   # specific subset
    python scripts/daily_ingest.py --dry-run           # fetch only, no upload
"""

import argparse
import logging
import os
import sys
import time
from datetime import datetime, timezone
from typing import Optional

# ── repo path setup ──────────────────────────────────────────────────────────
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, REPO_ROOT)
sys.path.insert(0, os.path.join(REPO_ROOT, "src"))

from data.processor import fetch_all_games

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("daily_ingest")

# ── username roster ───────────────────────────────────────────────────────────
# Add/remove Chess.com usernames here. All of these are fetched and uploaded
# on every daily run. Order doesn't matter — they run sequentially.
TRACKED_USERNAMES: list[str] = [
    # Project owner
    "EdwardL903",
    # Top GMs
    "magnuscarlsen",
    "fabianocaruana",
    "LevonAronian",
    "AnishGiri",
    "DanielNaroditsky",
    "nihalsarin2002",
    "AndrewTang",
    "rpragchess",
    "GMWSO",
    # Streamers / educators
    "hikaru",
    "GothamChess",
    "BotezLive",
    "Andrea",
]


# ── helpers ───────────────────────────────────────────────────────────────────

def _get_bigquery_client():
    """Return a BigQuery client using env-var creds (CI) or local keyfile."""
    from google.cloud import bigquery
    import json

    json_str = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS_JSON") or \
               os.environ.get("GOOGLE_CREDENTIALS")
    if json_str:
        import tempfile
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            f.write(json_str)
            tmp_path = f.name
        client = bigquery.Client.from_service_account_json(
            tmp_path, project="crucial-decoder-462021-m4"
        )
        os.unlink(tmp_path)
        return client

    # Local development fallback
    keyfile = os.path.join(REPO_ROOT, "gcp", "service_account.json")
    return bigquery.Client.from_service_account_json(
        keyfile, project="crucial-decoder-462021-m4"
    )


def _log_pipeline_run(
    bq_client,
    username: str,
    status: str,          # success | partial | failed | skipped
    games_fetched: int,
    games_uploaded: int,
    duration_seconds: float,
    error_message: Optional[str] = None,
):
    """Append one row to the pipeline_runs audit table in BigQuery."""
    from google.cloud import bigquery

    table_id = "crucial-decoder-462021-m4.test1.pipeline_runs"

    # Create table if it doesn't exist (idempotent via schema detection)
    schema = [
        bigquery.SchemaField("run_at",           "TIMESTAMP"),
        bigquery.SchemaField("username",          "STRING"),
        bigquery.SchemaField("status",            "STRING"),
        bigquery.SchemaField("games_fetched",     "INTEGER"),
        bigquery.SchemaField("games_uploaded",    "INTEGER"),
        bigquery.SchemaField("duration_seconds",  "FLOAT"),
        bigquery.SchemaField("error_message",     "STRING"),
        bigquery.SchemaField("triggered_by",      "STRING"),
    ]
    try:
        bq_client.get_table(table_id)
    except Exception:
        table = bigquery.Table(table_id, schema=schema)
        bq_client.create_table(table, exists_ok=True)

    rows = [{
        "run_at":           datetime.now(timezone.utc).isoformat(),
        "username":         username,
        "status":           status,
        "games_fetched":    games_fetched,
        "games_uploaded":   games_uploaded,
        "duration_seconds": round(duration_seconds, 2),
        "error_message":    error_message or "",
        "triggered_by":     os.environ.get("GITHUB_ACTOR", "local"),
    }]
    errors = bq_client.insert_rows_json(table_id, rows)
    if errors:
        logger.warning(f"pipeline_runs insert error for {username}: {errors}")
    else:
        logger.info(f"Logged pipeline_run for {username}: {status}")


# ── per-user pipeline ─────────────────────────────────────────────────────────

def ingest_user(username: str, dry_run: bool, bq_client) -> dict:
    """
    Full incremental ingest for one username.
    Returns a summary dict for the caller.
    """
    from api.bigquery_dashboard import bigquery_dashboard
    from datetime import datetime as _dt

    t0 = time.time()
    logger.info(f"{'[DRY RUN] ' if dry_run else ''}Starting ingest for {username}")

    games_fetched = 0
    games_uploaded = 0
    status = "success"
    error_message = None

    try:
        # 1. High-water mark
        max_end_time = bigquery_dashboard.get_max_end_time(username)
        since_month = None
        if max_end_time is not None:
            d = _dt.fromtimestamp(max_end_time)
            since_month = (d.year, d.month)
            logger.info(f"  High-water mark: {d.date()} → fetching from {since_month[0]}/{since_month[1]:02d}")
        else:
            logger.info(f"  No prior data for {username} — full fetch")

        # 2. Fetch all games (all years, incremental from high-water)
        raw_games = fetch_all_games(username, since_month=since_month)
        games_fetched = len(raw_games) if raw_games else 0
        logger.info(f"  Fetched {games_fetched} candidate games from Chess.com API")

        if not raw_games:
            logger.info(f"  No new games to upload for {username}")
            status = "skipped"
        elif dry_run:
            logger.info(f"  [DRY RUN] Would upload {games_fetched} games — skipping BigQuery write")
            status = "dry_run"
        else:
            # 3. Upload with internal dedup
            before_count = _get_row_count(bq_client, username)
            bigquery_dashboard.upload_raw_games(username, raw_games)
            after_count = _get_row_count(bq_client, username)
            games_uploaded = after_count - before_count
            logger.info(f"  Uploaded {games_uploaded} new rows for {username}")

    except Exception as e:
        status = "failed"
        error_message = str(e)
        logger.error(f"  Ingest failed for {username}: {e}", exc_info=True)

    duration = time.time() - t0
    logger.info(f"  Done in {duration:.1f}s — status={status}")

    return {
        "username": username,
        "status": status,
        "games_fetched": games_fetched,
        "games_uploaded": games_uploaded,
        "duration_seconds": duration,
        "error_message": error_message,
    }


def _get_row_count(bq_client, username: str) -> int:
    """Count rows in raw_games for a username (used to compute net-new rows)."""
    try:
        q = """
            SELECT COUNT(*) c FROM `crucial-decoder-462021-m4.test1.raw_games`
            WHERE LOWER(white_username) = LOWER(@u) OR LOWER(black_username) = LOWER(@u)
        """
        from google.cloud import bigquery as bq
        cfg = bq.QueryJobConfig(query_parameters=[bq.ScalarQueryParameter("u", "STRING", username)])
        row = next(iter(bq_client.query(q, job_config=cfg).result()), None)
        return int(row.c) if row else 0
    except Exception:
        return 0


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Chesslytics daily ingest pipeline")
    parser.add_argument(
        "usernames", nargs="*",
        help="Specific usernames to ingest (default: all TRACKED_USERNAMES)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Fetch from API but skip BigQuery upload"
    )
    args = parser.parse_args()

    usernames = args.usernames if args.usernames else TRACKED_USERNAMES
    dry_run   = args.dry_run

    logger.info(f"=== Chesslytics daily ingest — {datetime.now(timezone.utc).date()} ===")
    logger.info(f"Usernames: {usernames}")
    logger.info(f"Dry run:   {dry_run}")

    bq_client = _get_bigquery_client()

    results = []
    for username in usernames:
        result = ingest_user(username, dry_run=dry_run, bq_client=bq_client)
        results.append(result)
        if not dry_run:
            _log_pipeline_run(bq_client, **result)

    # ── summary ──────────────────────────────────────────────────────────────
    logger.info("\n=== Pipeline Summary ===")
    total_fetched  = sum(r["games_fetched"]  for r in results)
    total_uploaded = sum(r["games_uploaded"] for r in results)
    failed = [r["username"] for r in results if r["status"] == "failed"]

    for r in results:
        icon = "✅" if r["status"] == "success" else \
               "⏭️" if r["status"] in ("skipped", "dry_run") else "❌"
        logger.info(f"  {icon} {r['username']:20s} fetched={r['games_fetched']:5d}  "
                    f"uploaded={r['games_uploaded']:5d}  {r['duration_seconds']:.1f}s")

    logger.info(f"\nTotal fetched: {total_fetched}  Total uploaded: {total_uploaded}")

    if failed:
        logger.error(f"FAILED usernames: {failed}")
        sys.exit(1)   # non-zero exit causes GitHub Actions to flag the run as failed

    logger.info("All users ingested successfully.")


if __name__ == "__main__":
    main()
