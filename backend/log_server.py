
import os
import threading
import time
import json
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import requests
from waitress import serve
import chromadb
from sentence_transformers import SentenceTransformer
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv() # Load environment variables from .env file

CONFIG_FILE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.json')

def load_config():
    """Loads configuration from config.json."""
    try:
        if os.path.exists(CONFIG_FILE_PATH):
            with open(CONFIG_FILE_PATH, 'r') as f:
                return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        pass # Return default config if file not found or invalid JSON
    return {} # Default empty config

def save_config(config):
    """Saves configuration to config.json."""
    with open(CONFIG_FILE_PATH, 'w') as f:
        json.dump(config, f, indent=4)

# --- Configuration ---
config = load_config()
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", config.get("llm_provider", "ollama"))  # "ollama" or "google"
OLLAMA_API_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL_NAME = "deepseek-r1:8b"
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL_NAME = "models/gemini-flash-latest"
current_log_dir = None


# --- RAG Components ---
chroma_client = None
embedding_model = None
indexing_status = {"status": "idle", "files_processed": 0, "total_files": 0, "current_file": ""}

app = Flask(__name__, static_folder='../frontend')
CORS(app)

# --- RAG Initialization ---
def initialize_rag():
    """Initializes the RAG components."""
    global chroma_client, embedding_model
    print("Initializing RAG components...")
    try:
        # 1. Initialize ChromaDB client
        chroma_client = chromadb.Client()
        # 2. Load the sentence transformer model
        embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
        print("RAG components initialized successfully.")
    except Exception as e:
        print(f"Error initializing RAG components: {e}")

# --- File Indexing ---
def index_log_file(filepath):
    """Chunks a log file, generates embeddings, and stores them in ChromaDB."""
    global indexing_status
    filename = os.path.basename(filepath)
    indexing_status["current_file"] = filename
    print(f"Indexing log file: {filename}")

    try:
        # Create a new collection for the file (or get it if it exists)
        # The collection name must be valid according to ChromaDB's criteria
        collection_name = "".join(c for c in filename if c.isalnum() or c in ('_', '-'))
        collection = chroma_client.get_or_create_collection(name=collection_name)

        with open(filepath, 'r', errors='ignore') as f:
            lines = f.readlines()

        # Chunk the file by lines
        chunks = [line.strip() for line in lines if line.strip()]
        
        # Generate embeddings for the chunks
        embeddings = embedding_model.encode(chunks, show_progress_bar=False)

        # Store the chunks and embeddings in ChromaDB
        ids = [f"{filename}_{i}" for i in range(len(chunks))]
        collection.add(
            embeddings=embeddings,
            documents=chunks,
            ids=ids
        )
        print(f"Finished indexing {filename}. Stored {len(chunks)} chunks.")
    except Exception as e:
        print(f"Error indexing file {filename}: {e}")

# --- File Watcher ---
class LogFileHandler(FileSystemEventHandler):
    def on_created(self, event):
        if not event.is_directory:
            index_log_file(event.src_path)

    def on_modified(self, event):
        if not event.is_directory:
            index_log_file(event.src_path)

def start_file_watcher(path):
    """Starts a file watcher in a background thread."""
    observer = Observer()
    observer.schedule(LogFileHandler(), path, recursive=False)
    observer.start()
    print(f"File watcher started for directory: {path}")

    # Keep the thread alive
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()

# --- API Endpoints ---
@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(app.static_folder, path)

@app.route('/api/log_dir', methods=['GET'])
def get_log_directory():
    """Returns the currently configured log directory."""
    global current_log_dir
    config = load_config()
    current_log_dir = config.get('log_dir')
    
    if current_log_dir is None:
        current_log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs')
        if not os.path.exists(current_log_dir):
            os.makedirs(current_log_dir, exist_ok=True)
            # Save the default log directory to config
            config['log_dir'] = current_log_dir
            save_config(config)
            
    return jsonify({"log_dir": current_log_dir})

@app.route('/api/log_dir', methods=['POST'])
def set_log_directory():
    """Sets the log directory and starts the file watcher."""
    global current_log_dir, indexing_status
    data = request.json
    new_log_dir = data.get('log_dir')
    if not new_log_dir:
        return jsonify({"error": "Log directory path is required."}), 400

    if not os.path.isabs(new_log_dir):
        return jsonify({"error": "Provided path must be absolute."}), 400
    
    if not os.path.isdir(new_log_dir):
        return jsonify({"error": "Provided path is not a directory."}), 400

    current_log_dir = new_log_dir

    # Save the new directory to the config file
    config = load_config()
    config['log_dir'] = current_log_dir
    save_config(config)
    
    # Start the indexing process in the background
    def index_all_files():
        global indexing_status
        files_to_process = [f for f in os.listdir(current_log_dir) if os.path.isfile(os.path.join(current_log_dir, f))]
        indexing_status = {"status": "indexing", "files_processed": 0, "total_files": len(files_to_process), "current_file": ""}
        for filename in files_to_process:
            filepath = os.path.join(current_log_dir, filename)
            index_log_file(filepath)
            indexing_status["files_processed"] += 1
        indexing_status["status"] = "idle"
        print("Finished indexing all files.")

    threading.Thread(target=index_all_files, daemon=True).start()
    
    # Start the file watcher in a background thread
    threading.Thread(target=start_file_watcher, args=(current_log_dir,), daemon=True).start()

    return jsonify({"message": f"Log directory set to {current_log_dir}. Indexing started in the background."})

@app.route('/api/get_llm_provider', methods=['GET'])
def get_llm_provider():
    config = load_config()
    return jsonify({"llm_provider": config.get("llm_provider", "ollama")})

@app.route('/api/set_llm_provider', methods=['POST'])
def set_llm_provider():
    data = request.json
    provider = data.get('llm_provider')
    if not provider:
        return jsonify({"error": "LLM provider is required."}), 400
    
    config = load_config()
    config['llm_provider'] = provider
    save_config(config)
    return jsonify({"message": f"LLM provider set to {provider}."})

@app.route('/api/indexing_status')

def get_indexing_status():

    """Returns the current status of the file indexing process."""

    return jsonify(indexing_status)



@app.route('/api/browse')

def browse_files():

    """Browses files and directories at a given path."""

    path = request.args.get('path')

    if not path:

        path = os.path.expanduser('~')
    
    if not os.path.exists(path) or not os.path.isdir(path):
        return jsonify({"error": "Invalid or non-existent directory path."}), 400

    try:
        items = os.listdir(path)
        dirs = sorted([d for d in items if os.path.isdir(os.path.join(path, d))])
        files = sorted([f for f in items if os.path.isfile(os.path.join(path, f))])
        
        return jsonify({
            "path": path,
            "dirs": dirs,
            "files": files
        })
    except Exception as e:
        return jsonify({"error": f"Failed to browse directory: {e}"}), 500

@app.route('/api/files')
def get_files():
    """Scans the configured LOG_DIR and returns a list of files."""
    if current_log_dir is None:
        return jsonify({"error": "Log directory not set."}), 400
    try:
        files = [f for f in os.listdir(current_log_dir) if os.path.isfile(os.path.join(current_log_dir, f))]
        return jsonify(files)
    except FileNotFoundError:
        return jsonify({"error": "Log directory not found."}, 404)

@app.route('/api/logs', methods=['POST'])
def get_logs_and_filter():
    """Reads the requested file line-by-line, applying a filter and limiting the output."""
    data = request.json
    filename = data.get('filename')
    filter_term = data.get('filterTerm', '').lower()

    if not filename:
        return jsonify({"error": "Filename is required."}, 400)

    filepath = os.path.join(current_log_dir, filename)

    if not os.path.exists(filepath):
        return jsonify({"error": "File not found."}, 404)

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

@app.route('/api/chat', methods=['POST'])
def chat_with_rag():
    """Handles chat requests using the RAG pipeline."""
    try:
        data = request.json
        print(f"Received /api/chat request: {data}")

        user_query = data.get('prompt')
        filename = data.get('filename') # We need the filename to query the correct collection
        llm_provider = data.get('llm_provider', LLM_PROVIDER) # New: Get provider from request, fallback to env

        if not user_query or not filename:
            return jsonify({"error": "Prompt and filename are required."}, 400)

        # Embed the user's query
        query_embedding = embedding_model.encode([user_query])[0].tolist()

        # Query the vector store for relevant log chunks
        collection_name = "".join(c for c in filename if c.isalnum() or c in ('_', '-'))
        try:
            collection = chroma_client.get_collection(name=collection_name)
        except ValueError:
            return jsonify({"error": f"The log file '{filename}' has not been indexed yet. Please wait for indexing to complete or check if the file is in the correct log directory."}), 400
        
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=10 # Retrieve the top 10 most relevant chunks
        )

        retrieved_chunks = results['documents'][0]
        
        # Augment the prompt with the retrieved chunks
        context = "\n".join(retrieved_chunks)
        augmented_prompt = f"User Query: {user_query}\n\nRelevant Log Entries:\n---\n{context}"

        if llm_provider == "google":
            try:
                print("Using Google Gemini provider")
                if not GEMINI_API_KEY:
                    print("GEMINI_API_KEY not found")
                    return jsonify({"error": "GEMINI_API_KEY environment variable not set."}), 500
                
                genai.configure(api_key=GEMINI_API_KEY)
                model = genai.GenerativeModel(GEMINI_MODEL_NAME)
                
                print("Sending request to Gemini API...")
                response = model.generate_content(augmented_prompt)
                print(f"Gemini response object: {response}")

                if response.candidates:
                    first_candidate = response.candidates[0]
                    if first_candidate.content and first_candidate.content.parts:
                        text_response = "".join(part.text for part in first_candidate.content.parts)
                        if text_response:
                            print(f"Extracted text: {text_response}")
                            response_data = {"text": text_response}
                            return jsonify(response_data)

                # If we reach here, something went wrong.
                print("No valid text response found in Gemini response.")
                error_message = "Empty response from Gemini."
                if response.prompt_feedback:
                    error_message += f" Prompt feedback: {response.prompt_feedback}"
                return jsonify({"error": error_message}), 500

            except Exception as e:
                print(f"Error calling Gemini API: {e}")
                return jsonify({"error": f"Failed to get response from Gemini: {e}"}), 500
        else: # Default to ollama
            # Send the augmented prompt to the LLM
            ollama_payload = {
                "model": OLLAMA_MODEL_NAME,
                "prompt": augmented_prompt,
                "system": "You are a log analysis expert. Analyze the user's query based on the provided log entries and give a concise, helpful answer.",
                "stream": False
            }
            
            print(f"Sending request to Ollama at {OLLAMA_API_URL} with payload: {ollama_payload}")
            response = requests.post(OLLAMA_API_URL, json=ollama_payload)
            response.raise_for_status()
            ollama_response = response.json()
            print(f"Received response from Ollama: {ollama_response}")
            print(f"Ollama raw response: {ollama_response}") # Debug print
            response_data = {"text": ollama_response.get('response', 'No response text found.')}
            print("Returning JSON:", response_data)
            return jsonify(response_data)

    except Exception as e:
        print(f"RAG chat failed: {e}")
        return jsonify({"error": f"RAG chat failed: {e}"}, 500)

if __name__ == '__main__':
    initialize_rag()
    
    # --- Auto-start indexing if log directory is configured ---
    config = load_config()
    current_log_dir = config.get('log_dir')
    if current_log_dir and os.path.isdir(current_log_dir):
        print(f"Log directory '{current_log_dir}' found in config. Starting background services.")
        
        def index_all_files():
            global indexing_status
            files_to_process = [f for f in os.listdir(current_log_dir) if os.path.isfile(os.path.join(current_log_dir, f))]
            indexing_status = {"status": "indexing", "files_processed": 0, "total_files": len(files_to_process), "current_file": ""}
            for filename in files_to_process:
                filepath = os.path.join(current_log_dir, filename)
                index_log_file(filepath)
                indexing_status["files_processed"] += 1
            indexing_status["status"] = "idle"
            print("Finished indexing all files.")

        threading.Thread(target=index_all_files, daemon=True).start()
        threading.Thread(target=start_file_watcher, args=(current_log_dir,), daemon=True).start()
    # --- End Auto-start ---

    print("Starting server on http://localhost:8080")
    serve(app, host='0.0.0.0', port=8080)
