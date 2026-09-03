import os
import json
import tempfile
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

APP_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(APP_DIR, 'db.json')

app = Flask(__name__, static_folder=APP_DIR)
CORS(app)

def read_db():
    if not os.path.exists(DB_FILE):
        return None
    try:
        with open(DB_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error reading {DB_FILE}: {e}")
        return None

def write_db_atomic(data):
    # Atomic write pattern using a temporary file in the same directory
    dir_name = os.path.dirname(DB_FILE)
    fd, tmp_path = tempfile.mkstemp(prefix='db_', suffix='.tmp', dir=dir_name)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, DB_FILE)

@app.route('/db', methods=['GET'])
def get_db():
    data = read_db()
    if data is None:
        return jsonify({"empty": True}), 200
    return jsonify(data), 200

@app.route('/db', methods=['PUT', 'POST'])
def put_db():
    payload = request.get_json(force=True)
    if not payload or not isinstance(payload, dict):
        return jsonify({"error": "Invalid JSON object"}), 400
    try:
        write_db_atomic(payload)
        return jsonify({"ok": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Serve static app pages & assets directly
@app.route('/')
def root():
    return send_from_directory(APP_DIR, 'evprod.html')

@app.route('/<path:path>')
def static_proxy(path):
    if os.path.exists(os.path.join(APP_DIR, path)):
        return send_from_directory(APP_DIR, path)
    return "Not Found", 404

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"==================================================")
    print(f"  EV-Prod Server running at http://localhost:{port}")
    print(f"  Database file: {DB_FILE}")
    print(f"==================================================")
    app.run(host='0.0.0.0', port=port, debug=False)
