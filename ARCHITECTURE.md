# Log ExplOrer: System Design Document (v2.1 - Multi-LLM Support)

**Version:** 2.1
**Date:** 2025-11-21
**Authors:** leoricaborda@gmail.com
**Status:** Implemented

## 1. Introduction and Goals

This document outlines the architecture for the Log ExplOrer, a log analysis tool that leverages a **pluggable Large Language Model (LLM)** backend through a sophisticated **Retrieval-Augmented Generation (RAG)** pipeline. This new architecture enhances the tool's ability to understand and analyze large log files by providing the LLM with the most relevant context, while also offering the flexibility to switch between a local LLM (Ollama) and a powerful cloud-based LLM (Google Gemini).

### 1.1. Core Objectives

-   **Flexibility:** Allow users to choose between a local, private LLM and a powerful, scalable cloud LLM.
-   **Scalability:** Efficiently process and index large log files without high memory consumption.
-   **Semantic Search:** Move beyond simple keyword filtering to enable true semantic search of log data.
-   **Intelligent Analysis:** Provide the LLM with highly relevant, targeted context to improve the quality and accuracy of its analysis.
-   **Automation:** Automatically detect and index new or changed log files.

## 2. System Architecture (RAG-Enabled, Multi-LLM)

The system is a local client-server application with a powerful RAG pipeline integrated into the backend. The key change in this version is the abstraction of the LLM service and the persistence of user settings.

### 2.1. Component Breakdown

-   **Client (Presentation Tier):** `index.html`
    -   The user interface for log viewing, directory selection, and chat interaction. It now includes a dropdown for selecting the LLM provider and a resizable chat panel.
-   **Backend Server (Application Tier):** `log_server.py` (Python/Flask)
    -   **Web Server:** Handles API requests from the client.
    -   **RAG Pipeline:** Manages the entire process of log file indexing and retrieval.
    -   **File Watcher:** Monitors the log directory for changes.
    -   **LLM Gateway:** A new logical component that directs requests to the configured LLM provider.
    -   **Configuration Manager:** A new logical component that manages user settings stored in `backend/config.json`.
-   **Vector Store (Data Tier):** ChromaDB
    -   Stores the numerical representations (embeddings) of log chunks for fast semantic search.
-   **LLM Service (Service Tier):** Pluggable (Ollama or Google Gemini)
    -   **Ollama:** Hosts a local, user-managed LLM.
    -   **Google Gemini:** Provides access to a powerful, cloud-based LLM via API.
    -   The choice of provider is now selected in the UI and persisted in `backend/config.json`. Environment variables can be used for initial setup, but the UI selection takes precedence for chat requests.

### 2.2. The RAG Pipeline

The core of the new architecture is the RAG pipeline, which transforms raw log files into a queryable knowledge base.

#### 2.2.1. Ingestion / Indexing (Asynchronous)

This process runs in the background, triggered by the File Watcher.

1.  **File Detection:** The File Watcher detects a new or modified log file in the user-configured directory.
2.  **Chunking:** The log file is read and split into small, logical chunks (e.g., individual log lines).
3.  **Embedding:** Each chunk is passed to a **Sentence Transformer** model (e.g., `all-MiniLM-L6-v2`), which converts the text into a dense vector embedding—a numerical representation of its meaning.
4.  **Storage:** The text chunks and their corresponding embeddings are stored in a **ChromaDB** collection. Each collection is specific to a log file, allowing for targeted searching.

#### 2.2.2. Retrieval & Generation (Synchronous - API Call)

This process happens when a user sends a message from the client.

1.  **Query:** A user sends a query (e.g., "What caused the payment failure?") to the `/api/chat` endpoint.
2.  **Query Embedding:** The backend embeds the user's query using the *same* Sentence Transformer model.
3.  **Semantic Search:** The backend uses the query embedding to search the ChromaDB collection for the current log file, retrieving the top `k` most semantically similar log chunks.
4.  **Context Augmentation:** The retrieved log chunks are formatted and combined with the user's original query into a detailed prompt.
5.  **LLM Generation:** This final prompt is sent to the configured LLM (Ollama or Gemini) via the **LLM Gateway**. The gateway checks the `llm_provider` from the request body first, then falls back to the `llm_provider` in `config.json`, and finally to the `LLM_PROVIDER` environment variable.
6.  **Response:** The answer is returned to the client.

## 3. Technical Stack and Dependencies

### 3.1. Backend (`log_server.py`)

-   **Python 3:** Core language.
-   **Flask:** Web framework.
-   **Waitress:** Production-ready WSGI server.
-   **Flask-CORS:** Manages cross-origin requests.
-   **Requests:** Makes HTTP calls to the Ollama API.
-   **ChromaDB (`chromadb`):** The vector store for embeddings.
-   **Sentence Transformers (`sentence-transformers`):** For generating text embeddings.
-   **Watchdog (`watchdog`):** For monitoring the file system.
-   **Google Generative AI (`google-generativeai`):** The client library for the Gemini API.
-   **Python Dotenv (`python-dotenv`):** For loading environment variables from a `.env` file.

### 3.2. Frontend (`index.html`)

-   **HTML5/JavaScript:** Core application logic.
-   **Tailwind CSS:** For styling.

## 4. API Endpoints

-   `GET /api/log_dir`: Get the current log directory from `config.json`.
-   `POST /api/log_dir`: Set a new log directory and save it to `config.json`. This action now triggers the file watcher to start indexing.
-   `GET /api/files`: List files in the current log directory.
-   `POST /api/logs`: Get raw log content (for direct viewing).
-   `POST /api/chat`: **(Modified)** Executes the RAG pipeline to get an intelligent answer from the configured LLM.
-   `GET /api/indexing_status`: **(New)** Provides the real-time status of the file indexing process.
-   `GET /api/get_llm_provider`: **(New)** Gets the persisted LLM provider from `config.json`.
-   `POST /api/set_llm_provider`: **(New)** Sets and persists the LLM provider in `config.json`.

## 5. Deployment and Discussion

-   **Configuration:** The choice of LLM is now decoupled from the code and managed via a combination of UI selection, a `config.json` file, and environment variables, making the application more flexible and user-friendly. The `GEMINI_API_KEY` can be securely stored in a `.env` file.
-   **Dependencies:** The backend now has several new, heavy dependencies, including PyTorch (a dependency of sentence-transformers). The installation process will be longer. The `google-generativeai` and `python-dotenv` libraries are additional dependencies.
-   **First-Time Use:** On first run or after changing a log directory, the application will need time to index the files. The new status indicator will be crucial for user feedback.
-   **Resource Usage:** The embedding models will consume additional CPU/GPU and RAM resources, especially during the initial indexing phase. When using a local LLM, resource usage will be significantly higher.