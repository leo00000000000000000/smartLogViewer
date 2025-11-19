# Log Analyst Pro

A web-based log viewing tool that uses a local Large Language Model (LLM) for intelligent log analysis.

## Current Status

The application is implemented with a Python/Flask backend and a simple HTML/CSS/JavaScript frontend.

-   **Backend**: A Flask server that serves log files from a configurable directory and acts as a proxy to an Ollama LLM service. It now uses `waitress` as a production-ready WSGI server.
-   **Frontend**: A single-page application that allows viewing logs, filtering, and interacting with the LLM. It now includes UI for setting the log directory.

## How to Run

### 1. Prerequisites

-   Python 3
-   Ollama installed and running. You can download it from [https://ollama.ai/](https://ollama.ai/).
-   A running LLM model within Ollama. You can pull a model using a command like `ollama pull codellama:7b-instruct`.

### 2. Installation

1.  **Create and activate a Python Virtual Environment (recommended):**

    ```bash
    python3 -m venv backend/.venv
    source backend/.venv/bin/activate
    ```

2.  **Install Python Dependencies:**

    ```bash
    pip install -r backend/requirements.txt
    ```

### 3. Running the Application

1.  **Start the Backend Server:**

    ```bash
    source backend/.venv/bin/activate
    python3 backend/log_server.py
    ```

    The server will start on `http://localhost:8080`.

2.  **Start the Frontend:**

    Open the `frontend/index.html` file in your web browser.

### 4. How to Use

1.  In the browser, set your desired log directory path using the "Log Directory" input field and click "Set Directory".
2.  Place your log files in the configured directory.
3.  The available log files will be listed on the left panel.
4.  Click on a file to view its content.
5.  Use the "Filter logs" input to filter the log content.
6.  Use the "Search buffer" to highlight text in the currently displayed log.
7.  Use the chatbox to interact with the LLM:
    -   To get a general analysis, type your question and press Enter.
    -   To filter using natural language, use the format `filter for: <your description>`. For example: `filter for: all errors`.
