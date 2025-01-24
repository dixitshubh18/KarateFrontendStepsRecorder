let isRecording = false;

// Function to inject content script
async function ensureContentScriptLoaded(tabId) {
    try {
        // Try to send a test message to check if content script is loaded
        await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    } catch (error) {
        // If content script is not loaded, inject it
        console.log('Injecting content script...');
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
        });
        // Wait a bit for the script to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

// Initialize popup state
async function initializePopup() {
    try {
        const state = await chrome.runtime.sendMessage({ action: 'getRecordingState' });
        isRecording = state.isRecording;
        updateUI();
        updateEventCount(state.events ? state.events.length : 0);
    } catch (error) {
        console.error('Error initializing popup:', error);
    }
}

document.getElementById('startRecording').addEventListener('click', async () => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
            console.error('No active tab found');
            return;
        }

        // Ensure content script is loaded
        await ensureContentScriptLoaded(tab.id);

        // Update background state
        await chrome.runtime.sendMessage({
            action: 'updateRecordingState',
            state: { isRecording: true, events: [] }
        });

        // Start recording in content script
        await chrome.tabs.sendMessage(tab.id, { action: 'startRecording' });

        isRecording = true;
        updateUI();
        console.log('Recording started successfully');
    } catch (error) {
        console.error('Error starting recording:', error);
        alert('Failed to start recording. Please refresh the page and try again.');
    }
});

document.getElementById('stopRecording').addEventListener('click', async () => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;

        await chrome.tabs.sendMessage(tab.id, { action: 'stopRecording' });
        await chrome.runtime.sendMessage({
            action: 'updateRecordingState',
            state: { isRecording: false }
        });

        isRecording = false;
        updateUI();
    } catch (error) {
        console.error('Error stopping recording:', error);
    }
});

function updateUI() {
    const startBtn = document.getElementById('startRecording');
    const stopBtn = document.getElementById('stopRecording');
    const status = document.getElementById('recordingStatus');

    startBtn.disabled = isRecording;
    stopBtn.disabled = !isRecording;
    
    if (isRecording) {
        status.textContent = 'Recording...';
        status.classList.remove('stopped');
        status.classList.add('recording');
    } else {
        status.textContent = 'Not Recording';
        status.classList.remove('recording');
        status.classList.add('stopped');
    }
}

function updateEventCount(count) {
    document.getElementById('eventsCount').textContent = `Events recorded: ${count}`;
}

// Initialize popup
initializePopup();

// Listen for event count updates
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateEventCount') {
        updateEventCount(request.count);
    }
});

document.getElementById('generateCode').addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, {action: 'getEvents'}, (response) => {
            const events = response.events || [];
            let karateCode = 'Feature: Recorded Test\n\nScenario: Recorded user interactions\n';
            
            if (events.length > 0) {
                karateCode += `* url '${events[0].url}'\n`;
            }

            events.forEach(event => {
                switch(event.type) {
                    case 'click':
                        karateCode += `* click("${event.xpath}")\n`;
                        break;
                    case 'input':
                        karateCode += `* input("${event.xpath}", "${event.value}")\n`;
                        break;
                    case 'keypress':
                        if (event.key === 'Enter') {
                            karateCode += `* keyboard(Key.ENTER)\n`;
                        } else if (event.key === 'Tab') {
                            karateCode += `* keyboard(Key.TAB)\n`;
                        } else if (event.key === 'Escape') {
                            karateCode += `* keyboard(Key.ESC)\n`;
                        }
                        break;
                    case 'navigation':
                        karateCode += `* waitForUrl("${event.toUrl}")\n`;
                        break;
                    case 'wait':
                        karateCode += `* delay(${event.duration})\n`;
                        break;
                }
            });

            document.getElementById('output').textContent = karateCode;
        });
    });
}); 