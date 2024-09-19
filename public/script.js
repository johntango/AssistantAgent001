// public/script.js
const serverUrl = '/api'; // Relative path since frontend is served by the same server

let threads = {};
let currentThreadId = null;

// DOM Elements
const newThreadBtn = document.getElementById('new-thread-btn');
const threadList = document.getElementById('thread-list');
const threadTitle = document.getElementById('thread-title');
const chatBox = document.getElementById('chat-box');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');

// Modal Elements
const assistantModal = document.getElementById('assistant-modal');
const closeModalSpan = document.querySelector('.close');
const assistantSelect = document.getElementById('assistant-select');
const confirmAssistantBtn = document.getElementById('confirm-assistant-btn');

// Event Listeners
newThreadBtn.addEventListener('click', openAssistantModal);
closeModalSpan.addEventListener('click', closeAssistantModal);
confirmAssistantBtn.addEventListener('click', createNewThreadWithAssistant);
sendBtn.addEventListener('click', sendMessage);
window.addEventListener('load', loadData);
window.addEventListener('click', (event) => {
    if (event.target == assistantModal) {
        closeAssistantModal();
    }
});

// Functions

// Open the Assistant selection modal
function openAssistantModal() {
    assistantModal.style.display = 'block';
    populateAssistantOptions();
}

// Close the Assistant selection modal
function closeAssistantModal() {
    assistantModal.style.display = 'none';
}

// Populate the Assistant dropdown with available Assistants
async function populateAssistantOptions() {
    try {
        const response = await fetch(`${serverUrl}/assistants`);
        if (!response.ok) {
            throw new Error('Failed to fetch Assistants.');
        }
        const assistants = await response.json();
        assistantSelect.innerHTML = ''; // Clear existing options
        assistants.forEach(assistant => {
            const option = document.createElement('option');
            option.value = assistant.name;
            option.textContent = assistant.name;
            assistantSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error fetching Assistants:', error);
    }
}

// Create a new thread with the selected Assistant
async function createNewThreadWithAssistant() {
    const selectedAssistant = assistantSelect.value;
    if (!selectedAssistant) {
        alert('Please select an Assistant.');
        return;
    }

    try {
        const response = await fetch(`${serverUrl}/threads`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ assistantName: selectedAssistant })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to create thread.');
        }

        const data = await response.json();
        const { threadId, assistantName } = data;

        // Update threads and UI
        if (!threads[threadId]) {
            threads[threadId] = {
                threadId,
                assistantName,
                messages: []
            };
        }

        renderThreadList();
        selectThread(threadId);
        closeAssistantModal();
    } catch (error) {
        console.error('Error creating thread:', error);
        alert(`Error: ${error.message}`);
    }
}

// Load persisted data from the server
async function loadData() {
    try {
        const response = await fetch(`${serverUrl}/data`);
        if (!response.ok) {
            throw new Error('Failed to fetch data.');
        }
        const data = await response.json();
        threads = {};
        data.forEach(thread => {
            threads[thread.threadId] = {
                threadId: thread.threadId,
                assistantName: thread.assistantName,
                messages: thread.messages
            };
        });
        renderThreadList();
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// Render the list of threads
function renderThreadList() {
    threadList.innerHTML = '';
    for (const threadId in threads) {
        const li = document.createElement('li');
        li.textContent = threads[threadId].assistantName + ' - ' + new Date(threads[threadId].createdAt || Date.now()).toLocaleString();
        li.dataset.threadId = threadId;
        if (threadId === currentThreadId) {
            li.classList.add('active');
        }
        li.addEventListener('click', () => selectThread(threadId));
        threadList.appendChild(li);
    }
}

// Select a thread and display its messages
function selectThread(threadId) {
    currentThreadId = threadId;
    renderThreadList();
    const thread = threads[threadId];
    threadTitle.textContent = `Assistant: ${thread.assistantName}`;
    renderChatBox(thread.messages);
}

// Render messages in the chat box
function renderChatBox(messages) {
    chatBox.innerHTML = '';
    messages.forEach(msg => {
        const msgDiv = document.createElement('div');
        msgDiv.classList.add('message', msg.sender);
        const textDiv = document.createElement('div');
        textDiv.classList.add('text');
        textDiv.textContent = msg.text;
        msgDiv.appendChild(textDiv);
        chatBox.appendChild(msgDiv);
    });
    chatBox.scrollTop = chatBox.scrollHeight;
}

function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !currentThreadId) return;

    // Add user message
    const userMessage = { sender: 'user', text };
    threads[currentThreadId].messages.push(userMessage);
    renderChatBox(threads[currentThreadId].messages);
    messageInput.value = '';

    // Send to server
    runAssistant(currentThreadId);
}

async function runAssistant(threadId) {
    const thread = threads[threadId];
    try {
        const response = await fetch(serverUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                threadId: threadId,
                messages: thread.messages,
                assistantName: 'Assistant' // Can be customized
            })
        });

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const data = await response.json();
        const assistantMessage = { sender: 'assistant', text: data.reply };
        thread.messages.push(assistantMessage);
        renderChatBox(thread.messages);
    } catch (error) {
        console.error('Error:', error);
        const errorMessage = { sender: 'assistant', text: 'Sorry, something went wrong.' };
        thread.messages.push(errorMessage);
        renderChatBox(thread.messages);
    }
}