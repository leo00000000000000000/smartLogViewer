
import os
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import requests

# Configuration
LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs')
OLLAMA_API_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL_NAME = "codellama:7b-instruct"  # Default model

app = Flask(__name__, static_folder='../frontend')
CORS(app)

# Ensure log directory exists
if not os.path.exists(LOG_DIR):
    os.makedirs(LOG_DIR)

@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(app.static_folder, path)

@app.route('/api/files')
def get_files():
    """Scans the configured LOG_DIR and returns a list of files."""
    try:
        files = [f for f in os.listdir(LOG_DIR) if os.path.isfile(os.path.join(LOG_DIR, f))]
        return jsonify(files)
    except FileNotFoundError:
        return jsonify({"error": "Log directory not found."}), 404

@app.route('/api/logs', methods=['POST'])
def get_logs_and_filter():
    """Reads the requested file line-by-line, applying a filter and limiting the output."""
    data = request.json
    filename = data.get('filename')
    filter_term = data.get('filterTerm', '').lower()

    if not filename:
        return jsonify({"error": "Filename is required."}), 400

    filepath = os.path.join(LOG_DIR, filename)

    if not os.path.exists(filepath):
        return jsonify({"error": "File not found."}), 404

    filtered_lines = []
    try:
        with open(filepath, 'r', errors='ignore') as f:
            for line in f:
                if not filter_term or filter_term in line.lower():
                    if len(filtered_lines) < 2000:
                        filtered_lines.append(line.strip())
                    else:
                        filtered_lines.append("... (Showing first 2000 matching lines) ...")
                        break
        return jsonify(filtered_lines)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/ollama_proxy', methods=['POST'])
def ollama_proxy():
    """Proxies requests to the Ollama LLM."""
    data = request.json
    user_query = data.get('prompt')
    system_prompt = data.get('system_prompt', '')

    if not user_query:
        return jsonify({"error": "Prompt is required."}), 400

    ollama_payload = {
        "model": OLLAMA_MODEL_NAME,
        "prompt": user_query,
        "system": system_prompt,
        "stream": False
    }

    try:
        response = requests.post(OLLAMA_API_URL, json=ollama_payload)
        response.raise_for_status()
        ollama_response = response.json()
        return jsonify({"text": ollama_response.get('response', 'No response text found.')})
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Failed to connect to Ollama: {e}"}), 502

if __name__ == '__main__':
    app.run(port=5000, debug=True)
