# Log Analyst Pro: System Design Document (v2.0 - RAG Integration)

**Version:** 2.0
**Date:** 2025-11-20
**Authors:** Gemini (Based on User Requirements)
**Status:** In Progress

## 1. Introduction and Goals

This document outlines the architecture for the Log Analyst Pro, a log analysis tool that leverages a local Large Language Model (LLM) through a sophisticated **Retrieval-Augmented Generation (RAG)** pipeline. This new architecture enhances the tool's ability to understand and analyze large log files by providing the LLM with the most relevant context.

### 1.1. Core Objectives

-   **Scalability:** Efficiently process and index large log files without high memory consumption.
-   **Semantic Search:** Move beyond simple keyword filtering to enable true semantic search of log data.
-   **Intelligent Analysis:** Provide the LLM with highly relevant, targeted context to improve the quality and accuracy of its analysis.
-   **Automation:** Automatically detect and index new or changed log files.

## 2. System Architecture (RAG-Enabled)

The system is a local client-server application with a powerful RAG pipeline integrated into the backend.

### 2.1. Component Breakdown

-   **Client (Presentation Tier):** `index.html`
    -   The user interface for log viewing, directory selection, and chat interaction.
-   **Backend Server (Application Tier):** `log_server.py` (Python/Flask)
    -   **Web Server:** Handles API requests from the client.
    -   **RAG Pipeline:** Manages the entire process of log file indexing and retrieval.
    -   **File Watcher:** Monitors the log directory for changes.
-   **Vector Store (Data Tier):** ChromaDB
    -   Stores the numerical representations (embeddings) of log chunks for fast semantic search.
-   **LLM Service (Service Tier):** Ollama / Local LLM
    -   Hosts the foundational LLM used for the final generation step.

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
5.  **LLM Generation:** This final prompt is sent to the Ollama LLM, which generates a comprehensive, context-aware answer.
6.  **Response:** The answer is streamed back to the client.

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

### 3.2. Frontend (`index.html`)

-   **HTML5/JavaScript:** Core application logic.
-   **Tailwind CSS:** For styling.

## 4. API Endpoints

-   `GET /api/log_dir`: Get the current log directory.
-   `POST /api/log_dir`: Set a new log directory. This action now triggers the file watcher to start indexing.
-   `GET /api/files`: List files in the current log directory.
-   `POST /api/logs`: Get raw log content (for direct viewing).
-   `POST /api/chat`: **(Modified)** Executes the RAG pipeline to get an intelligent answer from the LLM.
-   `GET /api/indexing_status`: **(New)** Provides the real-time status of the file indexing process.

## 5. Deployment and Discussion

-   **Dependencies:** The backend now has several new, heavy dependencies, including PyTorch (a dependency of sentence-transformers). The installation process will be longer.
-   **First-Time Use:** On first run or after changing a log directory, the application will need time to index the files. The new status indicator will be crucial for user feedback.
-   **Resource Usage:** The embedding models will consume additional CPU/GPU and RAM resources, especially during the initial indexing phase.