# Log Analyst Pro

A web-based log viewing tool that uses a local Large Language Model (LLM) for intelligent log analysis.

## Current Status

The application is implemented with a Python/Flask backend and a simple HTML/CSS/JavaScript frontend.

-   **Backend**: A Flask server that serves log files from a `backend/logs` directory and acts as a proxy to an Ollama LLM service.
-   **Frontend**: A single-page application that allows viewing logs, filtering, and interacting with the LLM.

## How to Run

### 1. Prerequisites

-   Python 3
-   Ollama installed and running. You can download it from [https://ollama.ai/](https://ollama.ai/).
-   A running LLM model within Ollama. You can pull a model using a command like `ollama pull codellama:7b-instruct`.

### 2. Installation

1.  **Install Python Dependencies:**

    ```bash
    pip install Flask flask-cors requests
    ```

### 3. Running the Application

1.  **Start the Backend Server:**

    ```bash
    python backend/log_server.py
    ```

    The server will start on `http://localhost:5000`.

2.  **Start the Frontend:**

    Open the `frontend/index.html` file in your web browser.

### 4. How to Use

1.  Place your log files in the `backend/logs` directory.
2.  The available log files will be listed on the left panel.
3.  Click on a file to view its content.
4.  Use the "Filter logs" input to filter the log content.
5.  Use the "Search buffer" to highlight text in the currently displayed log.
6.  Use the chatbox to interact with the LLM:
    -   To get a general analysis, type your question and press Enter.
    -   To filter using natural language, use the format `filter for: <your description>`. For example: `filter for: all errors`.
