Log Analyst Pro: System Design Document

Version: 1.3 (LLM Model Recommendations Added)
Date: 2025-11-20
Authors: Gemini (Based on User Requirements)
Status: Draft

1. Introduction and Goals

The Log Analyst Pro is a powerful, Klogg-inspired log viewing and analysis tool designed to handle large log files and directories by leveraging a Local Large Language Model (LLM) for intelligent log interpretation and conversational filtering.

1.1 Core Objectives

Scalability: Efficiently read and display large log files without loading the entire content into the client's memory.

Local LLM Integration: Utilize a local model (Local LLM via Ollama) for analysis to maintain data privacy and reduce dependency on cloud services.

Enhanced User Experience: Provide a rich, responsive interface with traditional filtering/search alongside modern conversational search capabilities.

Client-Server Architecture: Decouple log processing and LLM interaction from the client for robust performance and security.

2. System Architecture

The application follows a Three-Tier Client-Server Architecture running entirely on the user's local machine (assumed to be a Fedora system).

2.1 Component Breakdown

Client (Presentation Tier): index.html (HTML/Tailwind CSS/JavaScript)

Function: User interface for log viewing, filtering, and interaction.

Communication: Communicates with the Backend Server via REST API calls.

Backend Server (Application Tier): log_server.py (Python/Flask)

Function: Acts as the central hub. Handles file system access, performs filtering, and proxies LLM requests.

Communication: Listens on port 5000 for client requests; makes internal requests to the Ollama LLM.

LLM Service (Data/Service Tier): Ollama / Local LLM

Function: Hosts the LLM to perform natural language processing tasks.

Communication: Listens on port 11434.

2.2 LLM Interaction Flow

Client: Sends an analysis prompt (log snippet or chat query) to http://localhost:5000/api/ollama_proxy.

Backend Server (log_server.py): Receives the request, constructs the appropriate Ollama payload (with system and user prompts), and sends it to http://localhost:11434/api/generate.

Ollama: Generates the text response using the Local LLM.

Backend Server: Receives the raw text response and relays it back to the Client.

Client: Displays the result or applies the extracted filter keyword.

3. Core Features and Functionality

3.1 Log File Management (Backend Responsibility - Code Details)

The core challenge of handling large files is solved on the backend by reading files line-by-line to avoid loading the entire content into memory (a process known as streaming). Filtering is applied during this stream.

Feature

Endpoint

Description

Directory Listing

GET /api/files

Scans the configured LOG_DIR and returns a list of files.

Large File Handling

POST /api/logs

Reads the requested file line-by-line, applies the filterTerm, and limits the output to the first 2000 matching lines for efficient client rendering.

Backend Implementation Snippet (log_server.py: get_logs_and_filter)

# Reads file line-by-line, filtering and limiting output
with open(filepath, 'r', errors='ignore') as f:
    for line in f:
        if not filter_term or filter_term in line.lower():
            if len(filtered_lines) < 2000:
                filtered_lines.append(line.strip())
            else:
                filtered_lines.append(f"... (Showing first 2000 matching lines...) ...")
                break


Client Implementation Snippet (index.html: loadLogFile)

The client sends the filename and the current filter term to the backend:

// Client side fetch call to load logs
const response = await fetch(`${BACKEND_URL}/api/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, filterTerm })
});


3.2 LLM-Powered Analysis (Proxy Responsibility - Code Details)

The backend acts as a simple proxy, packaging the client's request into the format expected by the Ollama API.

Feature

Prompt Role

Output

Log Snippet Analysis

"Log Analysis Expert"

Detailed analysis, troubleshooting steps.

Conversational Filtering

"Log Filter Expert"

Strict Output: Single keyword/phrase only.

Backend Ollama Proxy Implementation Snippet (log_server.py: ollama_proxy)

The Flask server constructs the JSON payload required by Ollama, including the model name, user prompt, and the strict system prompt:

# Ollama payload construction
ollama_payload = {
    "model": OLLAMA_MODEL_NAME, # e.g., codellama:7b-instruct
    "prompt": user_query,
    "system": system_prompt,
    "stream": False 
}

# Request sent to Ollama's local endpoint (http://localhost:11434/api/generate)
response = requests.post(OLLAMA_API_URL, json=ollama_payload)
response.raise_for_status() 

ollama_response = response.json()
return jsonify({"text": ollama_response.get('response', 'No response text found.')})


3.3 Client Features (Frontend Responsibility)

The client handles local UI interactions, including search and highlighting on the currently displayed buffer.

Feature

Description

File Selection

Dynamically loads the file list from the backend and allows the user to select a log file.

Real-time Filtering

Triggers a server-side filter and reloads the log view whenever the filter input changes or the chat extracts a keyword.

Local Search/Highlight

Performs a simple in-buffer search and highlighting within the currently loaded log content.

Custom Modal

Replaces standard browser alerts/confirms with a custom UI element for a smoother user experience.

4. Technical Stack and Dependencies

4.1 Backend (log_server.py)

Component

Purpose

Python 3

Core language environment.

Flask

Lightweight web framework for handling REST API requests.

Flask-CORS

Essential for allowing the browser client to communicate with the local server.

Requests

Used to make HTTP calls to the local Ollama API.

4.2 Frontend (index.html)

Component

Purpose

HTML5/JavaScript

Core application structure and client-side logic.

Tailwind CSS

Utility-first CSS framework for a responsive and modern aesthetic.

Firebase SDK

Used for environment-required user authentication (though not used for persistent data storage in this application).

4.3 LLM Service

Component

Purpose

Ollama

Local LLM host and API server.

Local LLM

The model used for intelligent log analysis (user's choice).

4.4 Local LLM Model Recommendations

For optimal log analysis, the chosen Local LLM should excel at two key tasks: parsing structured data (log entries, stack traces) and strict instruction following (extracting a single filter keyword).

Model Category

Recommended Ollama Tags

Rationale for Log Analysis

Code/Technical

codellama:7b-instruct, phind-codellama

Highly effective for deciphering stack traces, error messages, and suggesting code-level fixes based on log context. Essential for detailed technical analysis.

General/Context

mixtral:8x7b-instruct-v0.1, llama3:8b-instruct

Excellent for broad summarization, handling long log snippets (high context window), and providing high-quality, articulate analyses. Ideal for high-level system monitoring.

The model can be changed by updating the OLLAMA_MODEL_NAME variable in the log_server.py file.

5. Deployment and Discussion Points

5.1 Deployment Steps

Install Python Dependencies: (pip install Flask flask-cors requests)

Install/Run Ollama & Pull Model: (ollama pull codellama:7b-instruct - using a default example)

Configure Log Directory: Update LOG_DIR in log_server.py.

Start Server: (python log_server.py)

Open Client: Load index.html in the browser.

5.2 Discussion Points for Review

Log Output Limit: The server currently limits output to 2000 lines. Is this sufficient, or should we implement client-side virtual scrolling to handle larger unfiltered outputs?

Filter Persistence: Currently, clearing the filter reloads the file with an empty filter term. Should the client maintain a history of applied filters?

CORS: The backend uses CORS(app) which allows all origins (*). Should this be restricted to specific origins for better security?