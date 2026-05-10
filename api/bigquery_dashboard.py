"""
BigQuery + Looker Studio Integration for Personalized Chess Dashboards
"""
import os
import json
import pandas as pd
from google.cloud import bigquery
from google.oauth2 import service_account
from google.api_core.exceptions import GoogleAPIError, NotFound
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import hashlib
import urllib.parse

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class BigQueryDashboardManager:
    def __init__(self):
        """Initialize BigQuery and Looker Studio integration"""
        self.project_id = "crucial-decoder-462021-m4"  # Match the project where data is uploaded
        self.dataset_id = "test1"  # Match the dataset where data is uploaded
        # NOTE: `games_table` is the legacy "everything flat" table read by
        # dashboard_top_picks-style queries. New writes all go to `raw_games`
        # (see _ensure_raw_games_table_exists / upload_raw_games).
        self.games_table = "megachessdataset"
        
        # Initialize BigQuery client
        self.client = self._get_bigquery_client()
        
        # Looker Studio dashboard template URL
        # Real Looker Studio dashboard - convert edit URL to embed URL
        # Original: https://lookerstudio.google.com/reporting/dbe35905-fe7a-4971-a502-0e0e5fbe7a3d/page/p_44hm6tf7sd/edit
        # Embed: https://lookerstudio.google.com/embed/reporting/dbe35905-fe7a-4971-a502-0e0e5fbe7a3d
        self.dashboard_template_url = "https://lookerstudio.google.com/embed/reporting/dbe35905-fe7a-4971-a502-0e0e5fbe7a3d"
        logger.info("BigQuery Dashboard Manager initialized")
    
    def _get_bigquery_client(self):
        """Get BigQuery client with service account"""
        try:
            # Check for Heroku environment variable first
            if os.environ.get('GOOGLE_APPLICATION_CREDENTIALS_JSON'):
                # Parse the JSON from environment variable
                credentials_info = json.loads(os.environ['GOOGLE_APPLICATION_CREDENTIALS_JSON'])
                credentials = service_account.Credentials.from_service_account_info(credentials_info)
                return bigquery.Client(credentials=credentials, project=credentials_info.get('project_id'))
            
            # Fallback to local service account file
            service_account_path = os.path.join(os.path.dirname(__file__), '..', 'gcp', 'service_account.json')
            
            if os.path.exists(service_account_path):
                return bigquery.Client.from_service_account_json(service_account_path)
            else:
                logger.warning("Service account not found. Using default credentials.")
                return bigquery.Client()
                
        except Exception as e:
            logger.error(f"Failed to initialize BigQuery client: {e}")
            raise
    
    def _ensure_dataset_exists(self):
        """Ensure the dataset exists"""
        try:
            dataset_ref = self.client.dataset(self.dataset_id)
            self.client.get_dataset(dataset_ref)
            logger.info(f"Dataset {self.dataset_id} exists")
        except NotFound:
            dataset = bigquery.Dataset(f"{self.project_id}.{self.dataset_id}")
            dataset.location = "US"  # Set your preferred location
            dataset = self.client.create_dataset(dataset)
            logger.info(f"Created dataset: {self.dataset_id}")
    
    def _ensure_raw_games_table_exists(self):
        """Ensure raw games table exists with schema matching Chess.com API response"""
        self._ensure_dataset_exists()
        
        # Raw games table schema - matches Chess.com API response structure
        # This is RAW data exactly as returned from the API (with nested objects flattened)
        raw_games_schema = [
            # Game identifiers (from API root level)
            bigquery.SchemaField("uuid", "STRING", mode="REQUIRED"),  # Primary key
            bigquery.SchemaField("url", "STRING"),
            bigquery.SchemaField("tcn", "STRING"),
            
            # Game metadata (from API root level)
            bigquery.SchemaField("pgn", "STRING"),  # Full PGN - raw from API
            bigquery.SchemaField("time_control", "STRING"),  # Raw format from API (e.g., "600")
            bigquery.SchemaField("end_time", "INTEGER"),  # Unix timestamp from API
            bigquery.SchemaField("rated", "BOOLEAN"),
            bigquery.SchemaField("time_class", "STRING"),  # blitz/rapid/bullet/daily
            bigquery.SchemaField("rules", "STRING"),
            bigquery.SchemaField("fen", "STRING"),  # Final position FEN
            bigquery.SchemaField("initial_setup", "STRING"),  # Initial board setup FEN
            
            # White player (flattened from nested "white" object)
            bigquery.SchemaField("white_username", "STRING"),
            bigquery.SchemaField("white_rating", "INTEGER"),
            bigquery.SchemaField("white_result", "STRING"),
            bigquery.SchemaField("white_uuid", "STRING"),
            
            # Black player (flattened from nested "black" object)
            bigquery.SchemaField("black_username", "STRING"),
            bigquery.SchemaField("black_rating", "INTEGER"),
            bigquery.SchemaField("black_result", "STRING"),
            bigquery.SchemaField("black_uuid", "STRING"),
            
            # Accuracies (flattened from nested "accuracies" object - optional)
            bigquery.SchemaField("white_accuracy", "FLOAT"),
            bigquery.SchemaField("black_accuracy", "FLOAT"),
            
            # Load metadata
            bigquery.SchemaField("uploaded_at", "TIMESTAMP", mode="REQUIRED"),
            bigquery.SchemaField("loaded_by_user", "STRING"),  # Username who triggered the load
        ]
        
        table_ref = self.client.dataset(self.dataset_id).table("raw_games")
        try:
            self.client.get_table(table_ref)
            logger.info(f"Table raw_games exists")
        except NotFound:
            table = bigquery.Table(table_ref, schema=raw_games_schema)
            self.client.create_table(table)
            logger.info(f"Created table: raw_games")
    
    def flatten_raw_game(self, game: Dict[str, Any]) -> Dict[str, Any]:
        """
        Flatten a raw Chess.com API game response for BigQuery storage.
        Flattens nested objects (white, black, accuracies) to top-level fields.
        
        Args:
            game: Raw game dictionary from Chess.com API
            
        Returns:
            Flattened game dictionary ready for BigQuery
        """
        flattened = {
            # Root level fields
            "uuid": game.get("uuid"),
            "url": game.get("url"),
            "tcn": game.get("tcn"),
            "pgn": game.get("pgn"),
            "time_control": game.get("time_control"),
            "end_time": game.get("end_time"),
            "rated": game.get("rated"),
            "time_class": game.get("time_class"),
            "rules": game.get("rules"),
            "fen": game.get("fen"),
            "initial_setup": game.get("initial_setup"),
            
            # Flatten white player object
            "white_username": game.get("white", {}).get("username"),
            "white_rating": game.get("white", {}).get("rating"),
            "white_result": game.get("white", {}).get("result"),
            "white_uuid": game.get("white", {}).get("uuid"),
            
            # Flatten black player object
            "black_username": game.get("black", {}).get("username"),
            "black_rating": game.get("black", {}).get("rating"),
            "black_result": game.get("black", {}).get("result"),
            "black_uuid": game.get("black", {}).get("uuid"),
            
            # Flatten accuracies object (optional field)
            "white_accuracy": game.get("accuracies", {}).get("white"),
            "black_accuracy": game.get("accuracies", {}).get("black"),
        }
        
        return flattened
    
    # ------------------------------------------------------------------
    # Incremental-fetch helpers
    # ------------------------------------------------------------------
    # These let callers (tests/testing.py) skip re-fetching and re-uploading
    # games that BigQuery already has, and instead only pull months that
    # might contain new data.
    #
    # Filter is on actual player name (white_username/black_username), not
    # `loaded_by_user`, so games uploaded under a different user's session
    # are still correctly recognized as "already in BigQuery for this user".
    # ------------------------------------------------------------------

    def get_max_end_time(self, username: str) -> Optional[int]:
        """
        Return the Unix end_time of the most recent game in raw_games for
        this user, or None if BigQuery has no games for the user.

        Used to compute a "high-water mark" so we only re-fetch months
        from that point forward.
        """
        try:
            query = f"""
                SELECT MAX(end_time) AS max_end_time
                FROM `{self.project_id}.{self.dataset_id}.raw_games`
                WHERE LOWER(white_username) = LOWER(@username)
                   OR LOWER(black_username) = LOWER(@username)
            """
            job_config = bigquery.QueryJobConfig(
                query_parameters=[bigquery.ScalarQueryParameter("username", "STRING", username)]
            )
            row = next(iter(self.client.query(query, job_config=job_config).result()), None)
            return int(row.max_end_time) if row and row.max_end_time is not None else None
        except NotFound:
            # raw_games table doesn't exist yet — first run ever
            return None
        except Exception as e:
            logger.warning(f"get_max_end_time failed for {username}: {e}. Assuming no prior data.")
            return None

    def get_existing_uuids(self, username: str, since_end_time: Optional[int] = None) -> set:
        """
        Return the set of game UUIDs already in raw_games for this user.

        Args:
            username: Chess.com username (case-insensitive match on either color).
            since_end_time: If provided, only consider games with end_time >= this
                Unix timestamp. Use this to limit the scan when you only need to
                dedupe against recent uploads.
        """
        try:
            params = [bigquery.ScalarQueryParameter("username", "STRING", username)]
            since_clause = ""
            if since_end_time is not None:
                since_clause = "AND end_time >= @since_end_time"
                params.append(bigquery.ScalarQueryParameter("since_end_time", "INT64", since_end_time))

            query = f"""
                SELECT DISTINCT uuid
                FROM `{self.project_id}.{self.dataset_id}.raw_games`
                WHERE (LOWER(white_username) = LOWER(@username)
                       OR LOWER(black_username) = LOWER(@username))
                      {since_clause}
            """
            job_config = bigquery.QueryJobConfig(query_parameters=params)
            return {row.uuid for row in self.client.query(query, job_config=job_config).result()}
        except NotFound:
            return set()
        except Exception as e:
            logger.warning(f"get_existing_uuids failed for {username}: {e}. Assuming no prior data.")
            return set()

    def upload_raw_games(self, username: str, raw_games_data: List[Dict[str, Any]]):
        """
        Upload RAW game data to BigQuery source table (before transformations).
        Accepts raw Chess.com API response format and flattens nested objects.
        This data will be transformed by dbt intermediate models.

        Deduplicates against UUIDs already in raw_games for this user before
        uploading, so the table never grows duplicate rows for the same game.

        Args:
            username: Chess.com username who triggered the load
            raw_games_data: List of raw game dictionaries from Chess.com API response
                          (from the "games" array in the API response)
        """
        try:
            self._ensure_raw_games_table_exists()

            if not raw_games_data:
                logger.warning(f"No raw games data for user {username}")
                return

            # Flatten nested objects for BigQuery storage
            flattened_games = [self.flatten_raw_game(game) for game in raw_games_data]
            df = pd.DataFrame(flattened_games)

            # Add load metadata
            df['uploaded_at'] = datetime.now()
            df['loaded_by_user'] = username

            # Ensure uuid is present (required field). Drop rows with missing UUIDs.
            if 'uuid' not in df.columns:
                raise ValueError("UUID field is required for raw_games table")
            df = df.dropna(subset=['uuid'])

            if df.empty:
                logger.warning(f"No valid games to upload for user {username}")
                return

            # Dedupe against BigQuery: skip UUIDs we've already uploaded for this user.
            # Scan only the recent window we're actually uploading (cheaper than full scan).
            min_end_time = int(df['end_time'].dropna().min()) if 'end_time' in df.columns and not df['end_time'].dropna().empty else None
            existing_uuids = self.get_existing_uuids(username, since_end_time=min_end_time)
            if existing_uuids:
                before = len(df)
                df = df[~df['uuid'].isin(existing_uuids)]
                skipped = before - len(df)
                if skipped:
                    logger.info(f"Skipped {skipped} games already in raw_games for {username}")

            if df.empty:
                logger.info(f"All {len(raw_games_data)} games for {username} already in BigQuery; nothing to upload.")
                return

            # Append the new rows.
            table_ref = self.client.dataset(self.dataset_id).table("raw_games")
            job_config = bigquery.LoadJobConfig(
                write_disposition="WRITE_APPEND",
                schema_update_options=[bigquery.SchemaUpdateOption.ALLOW_FIELD_ADDITION]
            )
            load_job = self.client.load_table_from_dataframe(df, table_ref, job_config=job_config)
            load_job.result()

            logger.info(f"Successfully uploaded {len(df)} new raw games for user {username}")

        except Exception as e:
            logger.error(f"Failed to upload raw games for user {username}: {e}")
            raise
    
    # NOTE: upload_user_games, upload_user_statistics, _ensure_tables_exist
    # and get_user_data_from_bigquery were removed in May 2026. They wrote
    # to a `user_statistics` table that was read from nowhere, and the
    # `upload_user_games` alias accepted already-flattened CSV rows where
    # `upload_raw_games` (its target) expects nested Chess.com API responses
    # — silently corrupting data on every request. Raw uploads now go
    # exclusively through `upload_raw_games`, called from
    # `tests/testing.py` with the actual Chess.com API payload.
    
    def generate_personalized_dashboard_url(self, username: str, year: str = None) -> str:
        """Generate a personalized Looker Studio dashboard URL for the user"""
        try:
            # Build username_year parameter
            username_year = username
            if year:
                username_year = f"{username}_{year}"
            
            # Use the same dynamic view approach
            view_name = "chess_games_dynamic_view"
            view_id = f"{self.project_id}.{self.dataset_id}.{view_name}"
            
            # Create a URL with parameters that Looker Studio can use for filtering
            dashboard_url = (
                f"{self.dashboard_template_url}"
                f"?ds={self.project_id}.{self.dataset_id}.{view_name}"
                f"&user_filter={username_year}"
            )
            
            logger.info(f"Generated personalized dashboard URL for user {username} with year {year} -> {username_year}")
            return dashboard_url
            
        except Exception as e:
            logger.error(f"Failed to generate dashboard URL for user {username}: {e}")
            # Return a fallback URL
            return f"{self.dashboard_template_url}?user_filter={username}"
    
    def _generate_user_token(self, username: str) -> str:
        """Generate a secure token for dashboard access"""
        # Create a hash based on username and current date
        data = f"{username}_{datetime.now().strftime('%Y-%m-%d')}"
        return hashlib.sha256(data.encode()).hexdigest()[:16]
    
    def create_user_specific_dashboard_url(self, username: str, year: str = None) -> str:
        """Create a user-specific dashboard URL using a single dynamic view"""
        try:
            username_year = f"{username}_{year}" if year else username
            print(f"🔍 Creating dashboard for user: {username}, year: {year}, username_year: {username_year}")
            
            # Create or update the single dynamic view in BigQuery
            view_name = "chess_games_dynamic_view"
            view_id = f"{self.project_id}.{self.dataset_id}.{view_name}"
            
            # Create a view that includes all data but can be filtered by URL parameters
            # This view will be used by Looker Studio with URL parameters for filtering
            view_query = f"""
            CREATE OR REPLACE VIEW `{view_id}`
            AS SELECT 
                url,
                uuid,
                timestamp,
                time_class,
                game_type,
                rated,
                eco,
                my_opening,
                my_username,
                my_rating,
                my_result,
                my_color,
                opp_username,
                opp_rating,
                opp_result,
                my_win_or_lose,
                rating_diff,
                my_time_left,
                opp_time_left,
                my_time_left_ratio,
                opp_time_left_ratio,
                time_spent,
                my_moves,
                opp_moves,
                my_num_moves,
                en_passant_count,
                promotion_count,
                my_castling,
                opp_castling,
                month,
                weekday,
                hour,
                day_of_week,
                unique_id,
                uploaded_at,
                CONCAT(my_username, '_', EXTRACT(YEAR FROM timestamp)) as username_year
            FROM `{self.project_id}.{self.dataset_id}.{self.games_table}`
            """
            
            # Execute the view creation
            try:
                self.client.query(view_query).result()
                print(f"✅ Updated dynamic view: {view_name}")
                
                # Verify the view has data for this user
                verify_query = f"""
                SELECT COUNT(*) as count 
                FROM `{view_id}` 
                WHERE username_year = '{username_year}'
                """
                result = self.client.query(verify_query).result()
                for row in result:
                    count = row.count
                    print(f"📊 Found {count} records for {username_year} in dynamic view")
                    
            except Exception as e:
                print(f"⚠️ View update warning: {e}")
            
            # Create a URL with parameters that Looker Studio can use for filtering
            # The dashboard will use URL parameters to filter the data
            dashboard_url = (
                f"{self.dashboard_template_url}"
                f"?ds={self.project_id}.{self.dataset_id}.{view_name}"
                f"&user_filter={username_year}"
            )
            
            logger.info(f"Created user-specific dashboard URL for {username_year}: {dashboard_url}")
            print(f"🔗 Generated dashboard URL: {dashboard_url}")
            return dashboard_url
            
        except Exception as e:
            logger.error(f"Failed to create user-specific dashboard: {e}")
            print(f"❌ Error creating dashboard: {e}")
            # Fallback to regular dashboard
            return self.dashboard_template_url
    
    def create_embed_dashboard_url(self, username: str, year: str = None) -> dict:
        """Create a Looker Embed SDK configuration for the user"""
        try:
            username_year = f"{username}_{year}" if year else username
            
            # Create or update the single dynamic view in BigQuery
            view_name = "chess_games_dynamic_view"
            view_id = f"{self.project_id}.{self.dataset_id}.{view_name}"
            
            # Create a view that includes all data but can be filtered by URL parameters
            view_query = f"""
            CREATE OR REPLACE VIEW `{view_id}`
            AS SELECT 
                url,
                uuid,
                date,
                timestamp,
                time_control,
                time_class,
                game_type,
                rated,
                eco,
                my_opening,
                my_username,
                my_rating,
                my_result,
                my_color,
                opp_username,
                opp_rating,
                opp_result,
                my_win_or_lose,
                rating_diff,
                my_time_left,
                opp_time_left,
                my_time_left_ratio,
                opp_time_left_ratio,
                time_spent,
                my_moves,
                opp_moves,
                moves,
                my_num_moves,
                en_passant_count,
                promotion_count,
                my_castling,
                opp_castling,
                month,
                weekday,
                hour,
                day_of_week,
                unique_id,
                uploaded_at,
                CONCAT(my_username, '_', EXTRACT(YEAR FROM timestamp)) as username_year
            FROM `{self.project_id}.{self.dataset_id}.{self.games_table}`
            """
            
            # Execute the view creation
            try:
                self.client.query(view_query).result()
                print(f"✅ Updated dynamic view: {view_name}")
            except Exception as e:
                print(f"⚠️ View update warning: {e}")
            
            # Create embed configuration
            embed_config = {
                "dashboard_id": "dbe35905-fe7a-4971-a502-0e0e5fbe7a3d",  # Your dashboard ID
                "data_source": f"{self.project_id}.{self.dataset_id}.{view_name}",
                "filters": {
                    "username_year": username_year
                },
                "tile_id": None,  # Show full dashboard
                "embed_domain": "chesslytics.xyz",  # Your domain
                "force_logout_login": False,
                "session_length": 3600,  # 1 hour session
                "external_user_id": username,
                "user_attributes": {
                    "username": username,
                    "year": year or "all"
                }
            }
            
            logger.info(f"Created embed configuration for {username_year}")
            return embed_config
            
        except Exception as e:
            logger.error(f"Failed to create embed configuration: {e}")
            print(f"❌ Error creating embed config: {e}")
            return None

    def create_user_specific_view(self, username: str, year: str = None) -> str:
        """Create a user-specific view that only contains that user's data"""
        try:
            username_year = f"{username}_{year}" if year else username
            print(f"🔍 Creating user-specific view for: {username}, year: {year}, username_year: {username_year}")
            
            # Create a user-specific view name
            view_name = f"user_data_{username}_{year}".replace('-', '_').replace('.', '_')
            view_id = f"{self.project_id}.{self.dataset_id}.{view_name}"
            
            # Create a view that only contains this user's data
            view_query = f"""
            CREATE OR REPLACE VIEW `{view_id}`
            AS SELECT 
                *,
                CONCAT(my_username, '_', EXTRACT(YEAR FROM timestamp)) as username_year
            FROM `{self.project_id}.{self.dataset_id}.{self.games_table}`
            WHERE username = '{username}'
            """
            
            if year:
                view_query += f" AND EXTRACT(YEAR FROM date) = {year}"
            
            # Execute the view creation
            try:
                self.client.query(view_query).result()
                print(f"✅ Created user-specific view: {view_name}")
                
                # Verify the view has data
                verify_query = f"""
                SELECT COUNT(*) as count 
                FROM `{view_id}`
                """
                result = self.client.query(verify_query).result()
                for row in result:
                    count = row.count
                    print(f"📊 View contains {count} records for {username_year}")
                    
            except Exception as e:
                print(f"⚠️ View creation warning: {e}")
            
            # Return dashboard URL with the user-specific view
            dashboard_url = (
                f"{self.dashboard_template_url}"
                f"?ds={self.project_id}.{self.dataset_id}.{view_name}"
            )
            
            logger.info(f"Created user-specific view URL for {username_year}: {dashboard_url}")
            print(f"🔗 Generated view URL: {dashboard_url}")
            return dashboard_url
            
        except Exception as e:
            logger.error(f"Failed to create user-specific view: {e}")
            print(f"❌ Error creating user-specific view: {e}")
            # Fallback to regular dashboard
# Global instance
bigquery_dashboard = BigQueryDashboardManager() 