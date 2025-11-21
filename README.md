# Log Analyst Pro

A web-based log viewing tool that uses a local Large Language Model (LLM) for intelligent log analysis.

## Current Status

The application is implemented with a Python/Flask backend and a simple HTML/CSS/JavaScript frontend.

-   **Backend**: A Flask server that serves log files from a configurable directory and acts as a proxy to an Ollama LLM service. It now uses `waitress` as a production-ready WSGI server and persists user settings in `backend/config.json`.
-   **Frontend**: A single-page application that allows viewing logs, filtering, and interacting with the LLM. It now includes a dropdown to select the LLM provider, a resizable chat panel, and persists the log directory and LLM selection.

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

### 3. LLM Configuration

This application can be configured to use either a local LLM (via Ollama) or a cloud-based LLM (Google Gemini).

#### Using Google Gemini (Cloud LLM)

To use Google Gemini, you need to provide your `GEMINI_API_KEY`. It is recommended to store this key in a `.env` file in the `backend` directory.

1.  **Create a `.env` file:** In the `backend` directory, create a file named `.env`.
2.  **Add your API key:** Open the `backend/.env` file and add your Gemini API key:
    ```
    GEMINI_API_KEY="<YOUR_GEMINI_API_KEY>"
    # You can also set the default LLM provider here if you want it to override the UI selection on startup
    # LLM_PROVIDER="google" 
    ```
    You can get a Gemini API key from the [Google AI Studio](https://aistudio.google.com/).
    **Note:** The `.env` file is in `.gitignore` and will not be committed to your repository.

#### Using Ollama (Local LLM)

The application is configured to use the `deepseek-r1:8b` model by default. If you want to use a different model, you need to update the `OLLAMA_MODEL_NAME` variable in `backend/log_server.py`. No other configuration is needed if you are running Ollama on its default port.

### 5. How to Use

1.  **Set the log directory:** Use the "Set Log Directory" button to select the directory containing your log files. This directory will be remembered for future sessions.
2.  **Select LLM Provider:** Choose your desired LLM (Ollama or Google) from the dropdown in the header. This selection will also be remembered.
3.  **Explore Logs:**
    -   Click on a file in the left panel to view its content.
    -   Use the "Filter logs" input to narrow down the log entries.
    -   Use the "Search buffer" to highlight text in the currently displayed log.
4.  **Chat with the LLM:**
    -   Use the chatbox to ask questions about the logs.
    -   Resize the chat panel by dragging the bar at the top for a better view.
    -   To filter using natural language, use the format `filter for: <your description>`. For example: `filter for: all errors`.
5.  **Running the Application**
    -   Start the backend server by running `python backend/log_server.py`.
    -   Open the `frontend/index.html` file in your browser.
