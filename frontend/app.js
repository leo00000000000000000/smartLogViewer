document.addEventListener('DOMContentLoaded', () => {
    const fileList = document.getElementById('fileList');
    const logContent = document.getElementById('logContent');
    const filterInput = document.getElementById('filterInput');
    const searchInput = document.getElementById('searchInput');
    const currentFileSpan = document.getElementById('currentFile');
    const chatInput = document.getElementById('chatInput');
    const chatSendButton = document.getElementById('chatSendButton');
    const chatOutput = document.getElementById('chatOutput');

    // New UI elements for log directory
    const logDirPathInput = document.getElementById('logDirPath');
    const setLogDirButton = document.getElementById('setLogDirButton');
    const currentLogDirDisplay = document.getElementById('currentLogDirDisplay');


    const BACKEND_URL = 'http://localhost:8080';
    let currentLogFile = null;
    let logBuffer = []; // To store currently displayed log lines for local search

    // --- Log Directory Management ---
    async function getLogDirectory() {
        try {
            const response = await fetch(`${BACKEND_URL}/api/log_dir`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (data.log_dir) {
                currentLogDirDisplay.textContent = `Current: ${data.log_dir}`;
                logDirPathInput.value = data.log_dir;
            } else {
                currentLogDirDisplay.textContent = `Current: Not Set`;
                logDirPathInput.value = '';
            }
            return data.log_dir;
        } catch (error) {
            showModal('Error', `Failed to get log directory: ${error.message}`);
            currentLogDirDisplay.textContent = `Current: Error fetching`;
            return null;
        }
    }

    async function setLogDirectory() {
        const newLogDir = logDirPathInput.value;
        if (!newLogDir) {
            showModal('Warning', 'Please enter a log directory path.');
            return;
        }

        try {
            const response = await fetch(`${BACKEND_URL}/api/log_dir`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ log_dir: newLogDir })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            }
            showModal('Success', data.message);
            currentLogDirDisplay.textContent = `Current: ${data.log_dir}`;
            loadFiles(); // Reload files after setting new directory
        } catch (error) {
            showModal('Error', `Failed to set log directory: ${error.message}`);
        }
    }

    setLogDirButton.addEventListener('click', setLogDirectory);


    // --- File Management ---

    async function loadFiles() {
        // Ensure log directory is set before attempting to load files
        const currentDir = await getLogDirectory();
        if (!currentDir || currentDir === "Log directory not set." || currentDir === "Current: Error fetching") {
            fileList.innerHTML = '<li class="text-red-400">Log directory not set. Please configure it above.</li>';
            logContent.innerHTML = ''; // Clear log content if no directory
            currentFileSpan.textContent = 'None';
            return;
        }

        try {
            const response = await fetch(`${BACKEND_URL}/api/files`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            const files = await response.json();
            fileList.innerHTML = '';
            if (files.length === 0) {
                fileList.innerHTML = '<li class="text-gray-400">No log files found in the configured directory.</li>';
            }
            files.forEach(file => {
                const li = document.createElement('li');
                li.textContent = file;
                li.addEventListener('click', () => {
                    currentLogFile = file;
                    loadLogFile(file, filterInput.value);
                    currentFileSpan.textContent = file;
                    document.querySelectorAll('#fileList li').forEach(item => item.classList.remove('active'));
                    li.classList.add('active');
                });
                fileList.appendChild(li);
            });
        } catch (error) {
            showModal('Error', `Failed to load log files: ${error.message}`);
            fileList.innerHTML = `<li class="text-red-400">Error loading files: ${error.message}</li>`;
            logContent.innerHTML = '';
            currentFileSpan.textContent = 'None';
        }
    }

    async function loadLogFile(filename, filterTerm) {
        if (!filename) return;
        try {
            const response = await fetch(`${BACKEND_URL}/api/logs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename, filterTerm })
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            const logs = await response.json();
            logBuffer = logs; // Store for local search
            renderLogs(logs);
        } catch (error) {
            showModal('Error', `Failed to load log content for ${filename}: ${error.message}`);
            logContent.innerHTML = `<div class="text-red-400">Error: ${error.message}</div>`;
        }
    }

    function renderLogs(logs) {
        logContent.innerHTML = logs.map(line => `<div>${escapeHTML(line)}</div>`).join('');
    }

    // --- Filtering and Searching ---

    filterInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            loadLogFile(currentLogFile, filterInput.value);
        }
    });

    searchInput.addEventListener('keyup', () => {
        const searchTerm = searchInput.value.toLowerCase();
        if (!searchTerm) {
            renderLogs(logBuffer); // Re-render without highlights if search is cleared
            return;
        }
        const highlightedLogs = logBuffer.map(line => {
            const lowerLine = line.toLowerCase();
            if (lowerLine.includes(searchTerm)) {
                const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');
                return escapeHTML(line).replace(regex, `<span class="highlight">$1</span>`);
            }
            return escapeHTML(line);
        });
        logContent.innerHTML = highlightedLogs.map(line => `<div>${line}</div>`).join('');
    });


    // --- Chat and LLM Analysis ---

    chatSendButton.addEventListener('click', handleChat);
    chatInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            handleChat();
        }
    });

    async function handleChat() {
        const userQuery = chatInput.value;
        if (!userQuery) return;

        addChatMessage('You', userQuery);
        chatInput.value = '';

        // Determine if it's a filtering request or a general analysis
        const isFilterRequest = userQuery.toLowerCase().startsWith('filter for:');

        if (isFilterRequest) {
            await getFilterKeywordFromLLM(userQuery);
        } else {
            await getLogAnalysisFromLLM(userQuery);
        }
    }

    async function getFilterKeywordFromLLM(query) {
        const system_prompt = "You are a log filtering expert. Your task is to extract a single, precise keyword or phrase from the user's request. Respond with ONLY the keyword/phrase, nothing else. For example, if the user says 'filter for all error messages', you should respond with 'error'.";
        try {
            const response = await proxyToOllama(query, system_prompt);
            const keyword = response.text.trim();
            addChatMessage('LLM', `Applying filter: "${keyword}"`);
            filterInput.value = keyword;
            loadLogFile(currentLogFile, keyword);
        } catch (error) {
            addChatMessage('Error', `LLM filter extraction failed: ${error.message}`);
        }
    }

    async function getLogAnalysisFromLLM(query) {
        const logSnippet = logBuffer.slice(0, 50).join('\n'); // Send a snippet for context
        const fullQuery = `User Query: "${query}"\n\nLog Snippet:\n---\n${logSnippet}`;
        const system_prompt = "You are a log analysis expert. Analyze the user's query in the context of the provided log snippet and provide a concise, helpful analysis or troubleshooting advice.";

        try {
            const response = await proxyToOllama(fullQuery, system_prompt);
            addChatMessage('LLM', response.text);
        } catch (error) {
            addChatMessage('Error', `LLM analysis failed: ${error.message}`);
        }
    }

    async function proxyToOllama(prompt, system_prompt) {
        const response = await fetch(`${BACKEND_URL}/api/ollama_proxy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, system_prompt })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || `HTTP ${response.status}`);
        }
        return response.json();
    }

    function addChatMessage(sender, message) {
        const messageElement = document.createElement('div');
        const senderSpan = document.createElement('span');
        senderSpan.className = sender === 'You' ? 'text-blue-400 font-bold' : 'text-green-400 font-bold';
        senderSpan.textContent = `${sender}: `;

        const messageSpan = document.createElement('span');
        messageSpan.textContent = message;

        messageElement.appendChild(senderSpan);
        messageElement.appendChild(messageSpan);
        chatOutput.appendChild(messageElement);
        chatOutput.scrollTop = chatOutput.scrollHeight;
    }


    // --- Modal ---
    const modal = document.getElementById('customModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalConfirmButton = document.getElementById('modalConfirmButton');
    const modalCancelButton = document.getElementById('modalCancelButton');

    function showModal(title, message, onConfirm) {
        modalTitle.textContent = title;
        modalMessage.textContent = message;
        modal.classList.remove('hidden');

        // Clone and replace buttons to remove old event listeners
        const newConfirm = modalConfirmButton.cloneNode(true);
        modalConfirmButton.parentNode.replaceChild(newConfirm, modalConfirmButton);

        const newCancel = modalCancelButton.cloneNode(true);
        modalCancelButton.parentNode.replaceChild(newCancel, modalCancelButton);

        if (onConfirm) {
            newConfirm.classList.remove('hidden');
            newConfirm.addEventListener('click', () => {
                onConfirm();
                modal.classList.add('hidden');
            });
            newCancel.addEventListener('click', () => modal.classList.add('hidden'));
        } else {
            // It's just a notification
            newConfirm.classList.add('hidden');
            newCancel.textContent = 'Close';
            newCancel.addEventListener('click', () => modal.classList.add('hidden'));
        }
    }


    // --- Utility Functions ---
    function escapeHTML(str) {
        return str.replace(/[&<>"']/g, function (match) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[match];
        });
    }

    function escapeRegExp(string) {
      return string.replace(/[.*+?^${}()|[\\\]/g, '\\$&'); // $& means the whole matched string
    }


    // --- Initial Load ---
    getLogDirectory().then(() => {
        loadFiles();
    });
});