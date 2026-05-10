import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../src')))
from data.processor import *
from data.generate_progress import clear_generate_progress, write_generate_progress
from stats.analysis import *
from visualizations.plots import *
from data.uploader import *



import time
import sys
import json
import os
import numpy as np
import pandas as pd
from datetime import datetime, date

pd.set_option('display.max_rows', None)  # No limit on rows


def _json_default(obj):
    """Make json.dump tolerant of numpy/pandas types and datetimes.

    This protects against any value in the stats dict being a numpy scalar
    (e.g. int64 from a vectorized operation), a numpy array, a pandas
    Timestamp, or a native datetime — none of which the stdlib json
    encoder handles.
    """
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        return float(obj)
    if isinstance(obj, np.bool_):
        return bool(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, (pd.Timestamp, datetime, date)):
        return obj.isoformat()
    if isinstance(obj, pd.Timedelta):
        return obj.total_seconds()
    raise TypeError(f"Object of type {obj.__class__.__name__} is not JSON serializable")


def _is_all_games(year) -> bool:
    """Year sentinel for full-archive fetch (matches frontend ALL and legacy 0000)."""
    return str(year).strip().upper() in ("ALL", "0000")


def drop_columns(df):
    if 'pgn' in df.columns:
        df = df.drop(columns=['pgn'])
        print(df.columns)
    return df
    

def main(username, year):
    print("Chesslyzer booting...!!!")
    yr = str(year)

    output_dir = 'static/images/'
    os.makedirs(output_dir, exist_ok=True)

    # Start overall timer
    overall_start = time.time()

    write_generate_progress(username, yr, {"stage": "starting"})

    # Time fetch_and_process_game_data function
    start_time = time.time()
    if not _is_all_games(year):
        df = fetch_and_process_game_data(username, year)
    else:
        df = fetch_and_process_game_data(username, "ALL")

    fetch_process_duration = time.time() - start_time
    print(f"Fetching and processing data took {fetch_process_duration:.2f} seconds")

    # Time clean_dataframe function
    write_generate_progress(username, yr, {"stage": "cleaning"})
    start_time = time.time()
    metadata_df = clean_dataframe(df, username)
    clean_duration = time.time() - start_time
    print(f"Cleaning data took {clean_duration:.2f} seconds")

    print(f"Columns: {metadata_df.columns}")
    if metadata_df.empty:
        clear_generate_progress(username, yr)
        return []  # Return an empty DataFrame

    start_time = time.time()
    chess_df = metadata_df[(metadata_df['rules'] == 'chess') & (metadata_df['time_class'].isin(['blitz', 'rapid', 'bullet', 'daily']))]
    filter_duration = time.time() - start_time
    print(f"Filtering data took {filter_duration:.2f} seconds")

    print(chess_df.isna().sum())

    start_time = time.time()
    chess_df = chess_df.dropna()
    dropna_duration = time.time() - start_time
    print(f"Dropping NaN values took {dropna_duration:.2f} seconds")

    start_time = time.time()
    write_generate_progress(username, yr, {"stage": "statistics"})
    statistics = total_statistics(chess_df)
    statistics_duration = time.time() - start_time
    print(f"Calculating statistics took {statistics_duration:.2f} seconds")

    # Assuming 'statistics' is a dictionary
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    json_dir = os.path.join(project_root, 'data', 'json')
    os.makedirs(json_dir, exist_ok=True)
    json_path = os.path.join(json_dir, f'{username}_statistics.json')
    with open(json_path, 'w') as f:
        json.dump(statistics, f, indent=4, default=_json_default)

    start_time = time.time()
    write_generate_progress(username, yr, {"stage": "charts"})
    call_visualizations(chess_df, output_dir)
    visualization_duration = time.time() - start_time
    print(f"Generating visualizations took {visualization_duration:.2f} seconds")

    start_time = time.time()
    final_df = drop_columns(chess_df)
    csv_dir = os.path.join(project_root, 'data', 'csv')
    os.makedirs(csv_dir, exist_ok=True)
    csv_path = os.path.join(csv_dir, f'{username}.csv')
    final_df.to_csv(csv_path, index=False)
    saving_duration = time.time() - start_time
    print(f"Saving CSV file took {saving_duration:.2f} seconds")

    # Example for Excel output
    excel_path = os.path.join(project_root, 'data', f'{username}.xlsx')
    final_df.to_excel(excel_path, index=False)

    # Example for DataFrame JSON output
    df_json_dir = os.path.join(project_root, 'data', 'json')
    os.makedirs(df_json_dir, exist_ok=True)
    df_json_path = os.path.join(df_json_dir, f'{username}.df.json')
    final_df.to_json(df_json_path, orient='records', indent=4)

    # ============================================================
    # UPLOAD RAW DATA TO BIGQUERY (SOURCE LAYER) - INCREMENTAL
    # ============================================================
    # Strategy:
    #   1. Ask BigQuery for the latest end_time for this user (high-water mark).
    #   2. Convert it to (year, month) and only re-fetch from that month onward.
    #      The high-water month itself IS re-fetched because new games may
    #      have been added since the last upload.
    #   3. upload_raw_games() then dedupes against existing UUIDs in BigQuery,
    #      so the raw_games table never grows duplicates.
    # Transformations will be handled by dbt intermediate models.
    # ============================================================
    write_generate_progress(username, yr, {"stage": "uploading"})
    start_time = time.time()
    try:
        from api.bigquery_dashboard import bigquery_dashboard
        from datetime import datetime as _dt

        # 1. Compute high-water mark
        max_end_time = bigquery_dashboard.get_max_end_time(username)
        since_month = None
        if max_end_time is not None:
            d = _dt.fromtimestamp(max_end_time)
            since_month = (d.year, d.month)
            print(f"📅 BigQuery high-water mark for {username}: {d.isoformat()} -> "
                  f"fetching from {since_month[0]}/{since_month[1]:02d} onward")
        else:
            print(f"📅 No prior BigQuery data for {username}; doing full fetch.")

        # 2. Fetch only the months we might need
        if not _is_all_games(year):
            raw_games_from_api = fetch_all_games_for_selected_year(
                username, year, since_month=since_month
            )
        else:
            raw_games_from_api = fetch_all_games(username, since_month=since_month)

        # 3. Upload (with internal UUID dedupe)
        if raw_games_from_api:
            bigquery_dashboard.upload_raw_games(username, raw_games_from_api)
            print(f"✅ Processed {len(raw_games_from_api)} candidate raw games for {username}")
            print(f"📝 Note: Transformations will be done in dbt intermediate models")
        else:
            print(f"⚠️ No new raw games to upload for {username}")

    except Exception as e:
        print(f"⚠️ Failed to upload raw data to BigQuery: {e}")
        print("Continuing with local processing...")
        import traceback
        traceback.print_exc()

    upload_duration = time.time() - start_time
    print(f"Uploading raw data to BigQuery took {upload_duration:.2f} seconds")
    
    # ============================================================
    # LOCAL PROCESSING (for visualizations, CSV, etc.)
    # ============================================================
    # Continue with transformations for local use (visualizations, CSV exports)
    # This is separate from BigQuery data loading

    end_time = time.time()
    total_duration = end_time - overall_start
    print(f"Total execution time: {total_duration:.2f} seconds")



# Boilerplate to run main when executed directly (for testing or debugging)
if __name__ == "__main__":
    if len(sys.argv) > 1:
        username = sys.argv[1]  # Get username from command line arguments
        year = sys.argv[2]
        main(username, year)
    else:
        print("Usage: python testing.py <username> <year>")
