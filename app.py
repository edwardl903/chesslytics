from flask import Flask, send_from_directory, request, jsonify
from flask_cors import CORS
import subprocess
import os
import glob
import time
import json
import logging
import sys

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
_SRC = os.path.join(PROJECT_ROOT, "src")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)
from data.generate_progress import clear_generate_progress, read_generate_progress  # noqa: E402
# Import BigQuery dashboard system
try:
    from api.bigquery_dashboard import bigquery_dashboard
    BIGQUERY_ENABLED = True
    print("✅ BigQuery dashboard system enabled")
except ImportError as e:
    print(f"BigQuery dashboard system not available: {e}")
    BIGQUERY_ENABLED = False
except Exception as e:
    print(f"BigQuery dashboard system failed to initialize: {e}")
    BIGQUERY_ENABLED = False

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

FRONTEND_DIST = os.path.join(PROJECT_ROOT, 'frontend', 'dist')

# In production, Flask serves the built React bundle from frontend/dist.


def _serve_react_index():
    """Return the built React entry HTML, or a hint to build it if missing."""
    index_path = os.path.join(FRONTEND_DIST, 'index.html')
    if os.path.exists(index_path):
        return send_from_directory(FRONTEND_DIST, 'index.html')
    return (
        "<h1>Frontend not built</h1>"
        "<p>Run <code>cd frontend &amp;&amp; npm install &amp;&amp; npm run build</code>, "
        "or use <code>npm run dev</code> from <code>frontend/</code> for hot-reload "
        "development on http://localhost:5173.</p>",
        503,
    )


@app.route('/')
def serve_index():
    return _serve_react_index()


@app.route('/assets/<path:filename>')
def serve_react_assets(filename):
    """Vite emits hashed bundles into frontend/dist/assets/."""
    return send_from_directory(os.path.join(FRONTEND_DIST, 'assets'), filename)

@app.route('/generate/progress', methods=['GET'])
def generate_progress():
    """Poll lightweight progress written by tests/testing.py during POST /generate."""
    username = (request.args.get('username') or '').strip()
    year = (request.args.get('year') or '').strip()
    if not username or not year:
        return jsonify({'error': 'username and year are required'}), 400
    payload = read_generate_progress(username, year)
    return jsonify(payload if payload is not None else {})


@app.route('/generate', methods=['POST'])
def generate_csv():
    data = request.json
    username = data['username']
    year = data['year']
    yr = str(year)

    if not username:
        return jsonify({'error': 'Username is required'}), 400

    clear_generate_progress(username, yr)

    try:
        # Delete previous images
        image_files = glob.glob('static/images/*.png')
        for file in image_files:
            os.remove(file)

        # Run the analysis script
        result = subprocess.run(
            ["python3", "tests/testing.py", username, year],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        # Load statistics
        statistics_path = f'data/json/{username}_statistics.json'
        if os.path.exists(statistics_path):
            with open(statistics_path, 'r') as f:
                statistics = json.load(f)
            
            # Generate image paths
            image_paths = []
            timestamp = int(time.time())
            for i in range(0, 20):
                image_path = f"/static/images/image_{i}.png"
                full_path = os.path.join('static/images', f"image_{i}.png")
                if os.path.exists(full_path):
                    image_paths.append(f"{image_path}?t={timestamp}")
            
            # Generate personalized dashboard URL (BigQuery + Looker Studio)
            personalized_dashboard_url = None
            embed_config = None
            
            if BIGQUERY_ENABLED:
                # NOTE: raw game upload happens inside the subprocess above
                # (tests/testing.py -> bigquery_dashboard.upload_raw_games),
                # which is the only correct path — it has the unflattened
                # Chess.com API response. We only need to build the embed
                # config / dashboard URL here.
                try:
                    print(f"📊 Generating dashboard for user {username}...")
                    embed_config = bigquery_dashboard.create_embed_dashboard_url(username, year)
                    if embed_config:
                        print(f"✅ Embed SDK configuration generated for {username}_{year}")
                        personalized_dashboard_url = bigquery_dashboard.create_user_specific_dashboard_url(username, year)
                        print(f"✅ Dashboard URL generated: {personalized_dashboard_url}")
                    else:
                        print(f"❌ Embed SDK configuration failed for {username}")
                except Exception as e:
                    print(f"❌ BigQuery dashboard generation failed: {e}")
                    print("Continuing without BigQuery integration...")
            
            # Always generate a dashboard URL (fallback if BigQuery fails)
            if not embed_config:
                try:
                    if BIGQUERY_ENABLED and 'bigquery_dashboard' in globals():
                        embed_config = bigquery_dashboard.create_embed_dashboard_url(username, year)
                        personalized_dashboard_url = bigquery_dashboard.generate_personalized_dashboard_url(username, year)
                        print(f"📋 Using fallback embed config and URL")
                    else:
                        # Use a simple placeholder URL as last resort
                        personalized_dashboard_url = "https://lookerstudio.google.com/embed/reporting/dbe35905-fe7a-4971-a502-0e0e5fbe7a3d"
                        embed_config = {
                            "dashboard_id": "dbe35905-fe7a-4971-a502-0e0e5fbe7a3d",
                            "filters": {
                                "username_year": f"{username}_{year}" if year else username
                            },
                            "user_attributes": {
                                "username": username,
                                "year": year or "all"
                            }
                        }
                        print(f"📋 Using emergency fallback configuration")
                except Exception as e:
                    print(f"❌ Fallback dashboard generation failed: {e}")
                    # Use a simple placeholder URL as last resort
                    personalized_dashboard_url = "https://lookerstudio.google.com/embed/reporting/dbe35905-fe7a-4971-a502-0e0e5fbe7a3d"
                    embed_config = {
                        "dashboard_id": "dbe35905-fe7a-4971-a502-0e0e5fbe7a3d",
                        "filters": {
                            "username_year": f"{username}_{year}" if year else username
                        },
                        "user_attributes": {
                            "username": username,
                            "year": year or "all"
                        }
                    }
                    print(f"📋 Using emergency fallback configuration")
            
            # Build response with embed configuration
            response_data = {
                "images": image_paths,
                "my_avatar": statistics['my_avatar'],
                "my_username": statistics['my_username'],
                "total_time_spent": statistics['total_time_spent'],
                "total_moves": statistics['total_moves'],
                "total_win_draw_loss": statistics['total_win_draw_loss'],
                "total_results": statistics['total_results'],
                "total_en_passant": statistics['total_en_passant'],
                "total_promotions": statistics['total_promotions'],
                "total_games": statistics['total_games'],
                "longest_winning_streak": statistics['longest_winning_streak'],
                "longest_losing_streak": statistics['longest_losing_streak'],
                "most_played_opponent": statistics['most_played_opponent'],
                "highest_rating": statistics['highest_rating'],
                "most_time_spent_day_dict": statistics['most_time_spent_day_dict'],
                "my_openings": statistics['my_openings'],
                "timecontrol_counts": statistics['timecontrol_counts'],
                "timeclass_counts": statistics['timeclass_counts'],
                "biggest_games": statistics['biggest_games'],
                'last_game_ratings': statistics['last_game_ratings'],
                "personalized_dashboard_url": personalized_dashboard_url,
                "embed_config": embed_config
            }
            
            # Debug: Print the response data
            print(f"DEBUG: Response data keys: {list(response_data.keys())}")
            print(f"DEBUG: total_time_spent present: {'total_time_spent' in response_data}")
            print(f"DEBUG: total_time_spent value: {response_data.get('total_time_spent')}")
            print(f"DEBUG: personalized_dashboard_url present: {'personalized_dashboard_url' in response_data}")
            print(f"DEBUG: personalized_dashboard_url value: {response_data.get('personalized_dashboard_url')}")
            
            return jsonify(response_data)
        else:
            return jsonify({"error": "No games found for the user in 2024"}), 500

    except subprocess.CalledProcessError as e:
        print(f"Error: {e.stderr}")
        return jsonify({"error": "Failed to Generate - Sorry! Please contact us!"}), 500
    finally:
        clear_generate_progress(username, yr)

@app.route('/api/dashboard/refresh', methods=['POST'])
def refresh_dashboard():
    if not BIGQUERY_ENABLED:
        return jsonify({"error": "Dashboard system not available"}), 503
    
    try:
        data = request.json
        username = data.get('username')
        user_data = data.get('user_data', {})
        
        if not username:
            return jsonify({"error": "Username is required"}), 400
        
        # Try BigQuery first, then fallback to original system
        new_dashboard_url = None
        if BIGQUERY_ENABLED:
            try:
                new_dashboard_url = bigquery_dashboard.generate_personalized_dashboard_url(username)
            except Exception as e:
                print(f"BigQuery refresh failed: {e}")
        
        return jsonify({
            "success": True,
            "dashboard_url": new_dashboard_url,
            "message": "Dashboard refreshed successfully"
        })
        
    except Exception as e:
        print(f"Error refreshing dashboard: {e}")
        return jsonify({"error": "Failed to refresh dashboard"}), 500

@app.route('/api/dashboard/stats', methods=['GET'])
def get_dashboard_stats():
    if not BIGQUERY_ENABLED:
        return jsonify({"error": "Dashboard system not available"}), 503
    
    try:
        stats = {
            "bigquery_enabled": BIGQUERY_ENABLED
        }
        
        return jsonify(stats)
        
    except Exception as e:
        print(f"Error getting dashboard stats: {e}")
        return jsonify({"error": "Failed to get dashboard statistics"}), 500

# SPA fallback. Any unmatched GET that isn't an API/static path returns the
# React entry HTML so client-side routing (react-router) works on direct
# navigation and refreshes (e.g. /about, /opening-analyzer).
# IMPORTANT: this must be registered AFTER all real routes; Flask matches
# the first one that fits.
@app.route('/<path:path>')
def spa_fallback(path):
    # Poll endpoint lives under /generate/progress — must not hit the 404 branch
    # below (path.startswith('generate') matches 'generate/progress' too).
    if path == 'generate/progress':
        return generate_progress()
    # Anything starting with these prefixes should 404 here rather than
    # masquerading as the SPA shell.
    if path.startswith(('api/', 'static/', 'assets/')):
        return jsonify({"error": "Not found"}), 404
    if path.startswith('generate'):
        return jsonify({"error": "Not found"}), 404
    return _serve_react_index()


if __name__ == "__main__":
    # Get port from environment variable (Heroku sets PORT)
    port = int(os.environ.get("PORT", 5001))  # Changed to 5001 for experimental

    # Run the app
    app.run(host="0.0.0.0", port=port, debug=False)