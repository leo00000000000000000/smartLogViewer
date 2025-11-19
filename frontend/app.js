document.addEventListener('DOMContentLoaded', () => {
    // --- Main UI Elements ---
    const fileList = document.getElementById('fileList');
    const logContent = document.getElementById('logContent');
    const filterInput = document.getElementById('filterInput');
    const searchInput = document.getElementById('searchInput');
    const currentFileSpan = document.getElementById('currentFile');
    const chatInput = document.getElementById('chatInput');
    const chatSendButton = document.getElementById('chatSendButton');
    const chatOutput = document.getElementById('chatOutput');
    const currentLogDirDisplay = document.getElementById('currentLogDirDisplay');
    const indexingStatusDiv = document.getElementById('indexingStatus');
    const browseDirButton = document.getElementById('browseDirButton');

    // --- Directory Browser Modal Elements ---
    const dirBrowserModal = document.getElementById('dirBrowserModal');
    const dirBrowserPath = document.getElementById('dirBrowserPath');
    const dirBrowserContent = document.getElementById('dirBrowserContent');
    const setDirFromBrowserButton = document.getElementById('setDirFromBrowserButton');
    const closeDirBrowserButton = document.getElementById('closeDirBrowserButton');
    
    const BACKEND_URL = 'http://localhost:8080';
    let currentLogFile = null;
    let logBuffer = [];

    // --- Directory Browser Logic ---
    browseDirButton.addEventListener('click', () => {
        openDirectoryBrowser();
        dirBrowserModal.classList.remove('hidden');
    });

    closeDirBrowserButton.addEventListener('click', () => {
        dirBrowserModal.classList.add('hidden');
    });

    setDirFromBrowserButton.addEventListener('click', () => {
        const selectedDir = dirBrowserPath.textContent;
        setLogDirectory(selectedDir);
        dirBrowserModal.classList.add('hidden');
    });

    async function openDirectoryBrowser(path = '') {
        try {
            const response = await fetch(`${BACKEND_URL}/api/browse?path=${encodeURIComponent(path)}`);
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to browse directory.');
            }
            const data = await response.json();
            
            dirBrowserPath.textContent = data.path;
            dirBrowserContent.innerHTML = '';

            // Add '..' for parent directory
            if (data.path !== '/') {
                const parentDir = document.createElement('div');
                parentDir.className = 'cursor-pointer hover:bg-gray-700 p-1 rounded';
                parentDir.textContent = '..';
                parentDir.addEventListener('click', () => {
                    const parentPath = data.path.substring(0, data.path.lastIndexOf('/')) || '/';
                    openDirectoryBrowser(parentPath);
                });
                dirBrowserContent.appendChild(parentDir);
            }

            // Add directories
            data.dirs.forEach(dir => {
                const dirEl = document.createElement('div');
                dirEl.className = 'cursor-pointer hover:bg-gray-700 p-1 rounded';
                dirEl.textContent = `[${dir}]`;
                dirEl.addEventListener('click', () => {
                    const newPath = [data.path, dir].join(data.path.endsWith('/') ? '' : '/');
                    openDirectoryBrowser(newPath);
                });
                dirBrowserContent.appendChild(dirEl);
            });

            // Add files
            data.files.forEach(file => {
                const fileEl = document.createElement('div');
                fileEl.className = 'text-gray-400 p-1';
                fileEl.textContent = file;
                dirBrowserContent.appendChild(fileEl);
            });

        } catch (error) {
            dirBrowserContent.innerHTML = `<div class="text-red-400">${error.message}</div>`;
        }
    }


    // --- Indexing Status ---
    async function checkIndexingStatus() {
        try {
            const response = await fetch(`${BACKEND_URL}/api/indexing_status`);
            if (!response.ok) return;
            const data = await response.json();

            if (data.status === 'indexing') {
                indexingStatusDiv.classList.remove('hidden');
                indexingStatusDiv.textContent = `Indexing... (${data.files_processed}/${data.total_files}) - ${data.current_file}`;
            } else {
                indexingStatusDiv.classList.add('hidden');
            }
        } catch (error) {
            // Silently fail
        }
    }

    // --- Log Directory Management ---
    async function getLogDirectory() {
        // This function now just updates the display
        try {
            const response = await fetch(`${BACKEND_URL}/api/log_dir`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            if (data.log_dir) {
                currentLogDirDisplay.textContent = `Current: ${data.log_dir}`;
            } else {
                currentLogDirDisplay.textContent = 'Current: Not Set';
            }
            return data.log_dir;
        } catch (error) {
            currentLogDirDisplay.textContent = 'Current: Error fetching';
            return null;
        }
    }

    async function setLogDirectory(path) {
        try {
            const response = await fetch(`${BACKEND_URL}/api/log_dir`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ log_dir: path })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `HTTP error! status: ${response.status}`);
            
            showModal('Success', data.message);
            currentLogDirDisplay.textContent = `Current: ${path}`;
            loadFiles();
        } catch (error) {
            showModal('Error', `Failed to set log directory: ${error.message}`);
        }
    }

    // --- File Management ---
    async function loadFiles() {
        const currentDir = await getLogDirectory();
        if (!currentDir) {
            fileList.innerHTML = '<li class="text-red-400">Log directory not set. Please configure it.</li>';
            logContent.innerHTML = '';
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
                fileList.innerHTML = '<li class="text-gray-400">No log files found.</li>';
            } else {
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
            }
        } catch (error) {
            showModal('Error', `Failed to load log files: ${error.message}`);
            fileList.innerHTML = `<li class="text-red-400">Error: ${error.message}</li>`;
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
            logBuffer = logs;
            renderLogs(logs);
        } catch (error) {
            showModal('Error', `Failed to load log content for ${filename}: ${error.message}`);
        }
    }

    function renderLogs(logs) {
        logContent.innerHTML = logs.map(line => `<div>${escapeHTML(line)}</div>`).join('');
    }

    // --- Filtering and Searching ---
    filterInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') loadLogFile(currentLogFile, filterInput.value);
    });

    searchInput.addEventListener('keyup', () => {
        const searchTerm = searchInput.value.toLowerCase();
        if (!searchTerm) {
            renderLogs(logBuffer);
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
        if (event.key === 'Enter') handleChat();
    });

    async function handleChat() {
        const userQuery = chatInput.value;
        if (!userQuery || !currentLogFile) {
            showModal('Warning', 'Please select a log file and enter a query.');
            return;
        }

        addChatMessage('You', userQuery);
        chatInput.value = '';

        try {
            const response = await fetch(`${BACKEND_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: userQuery, filename: currentLogFile })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `HTTP error! status: ${response.status}`);
            addChatMessage('LLM', data.text);
        } catch (error) {
            addChatMessage('Error', `RAG analysis failed: ${error.message}`);
        }
    }
    
    function addChatMessage(sender, message) {
        const messageElement = document.createElement('div');
        messageElement.innerHTML = sender === 'You' 
            ? `<span class="text-blue-400 font-bold">${sender}:</span> ${escapeHTML(message)}`
            : `<span class="text-green-400 font-bold">${sender}:</span> ${escapeHTML(message)}`;
        chatOutput.appendChild(messageElement);
        chatOutput.scrollTop = chatOutput.scrollHeight;
    }

    // --- Modal ---
    const customModal = document.getElementById('customModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalConfirmButton = document.getElementById('modalConfirmButton');
    const modalCancelButton = document.getElementById('modalCancelButton');

    function showModal(title, message, onConfirm) {
        modalTitle.textContent = title;
        modalMessage.textContent = message;
        customModal.classList.remove('hidden');

        const newConfirm = modalConfirmButton.cloneNode(true);
        modalConfirmButton.parentNode.replaceChild(newConfirm, modalConfirmButton);

        const newCancel = modalCancelButton.cloneNode(true);
        modalCancelButton.parentNode.replaceChild(newCancel, modalCancelButton);

        if (onConfirm) {
            newConfirm.classList.remove('hidden');
            newConfirm.addEventListener('click', () => {
                onConfirm();
                customModal.classList.add('hidden');
            });
            newCancel.addEventListener('click', () => customModal.classList.add('hidden'));
        } else {
            newConfirm.classList.add('hidden');
            newCancel.textContent = 'Close';
            newCancel.addEventListener('click', () => customModal.classList.add('hidden'));
        }
    }

    // --- Utility Functions ---
    function escapeHTML(str) {
        return str.replace(/[&<>""]/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match]));
    }

    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\\]/g, '\\$&');
    }

    // --- Initial Load ---
    getLogDirectory().then(loadFiles);
    setInterval(checkIndexingStatus, 2000);
});