let recording = false;
let events = [];
let lastEvent = null;
const WAIT_THRESHOLD = 1000;

// Store recording state in chrome.storage
chrome.runtime.sendMessage({ action: 'getRecordingState' }, (state) => {
    recording = state.isRecording;
    events = state.events;
});

function getXPath(element) {
    if (element.id !== '')
        return `//*[@id="${element.id}"]`;
    
    if (element === document.body)
        return '/html/body';

    let ix = 0;
    let siblings = element.parentNode.childNodes;

    for (let i = 0; i < siblings.length; i++) {
        let sibling = siblings[i];
        if (sibling === element)
            return getXPath(element.parentNode) + '/' + element.tagName.toLowerCase() + '[' + (ix + 1) + ']';
        if (sibling.nodeType === 1 && sibling.tagName === element.tagName)
            ix++;
    }
}

function addEvent(type, details) {
    if (!recording) return;
    
    const timestamp = Date.now();
    
    // Add wait step if there's a significant pause between actions
    if (lastEvent && (timestamp - lastEvent.timestamp > WAIT_THRESHOLD)) {
        const waitTime = Math.round((timestamp - lastEvent.timestamp) / 1000);
        events.push({
            type: 'wait',
            duration: waitTime,
            timestamp: timestamp - waitTime
        });
    }

    const newEvent = {
        type: type,
        ...details,
        timestamp: timestamp
    };

    // Send event to background script
    chrome.runtime.sendMessage({
        action: 'addEvent',
        event: newEvent
    });
}

// Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Content script received message:', request.action);
    
    switch (request.action) {
        case 'ping':
            sendResponse({ status: 'alive' });
            break;
            
        case 'recordingStateChanged':
            recording = request.state.isRecording;
            events = request.state.events || [];
            sendResponse({status: 'State updated'});
            break;
            
        case 'startRecording':
            recording = true;
            events = [];
            chrome.runtime.sendMessage({
                action: 'updateRecordingState',
                state: { isRecording: true, events: [] }
            });
            console.log('Recording started'); // Debug log
            sendResponse({status: 'Started recording'});
            break;
            
        case 'stopRecording':
            recording = false;
            chrome.runtime.sendMessage({
                action: 'updateRecordingState',
                state: { isRecording: false }
            });
            console.log('Recording stopped'); // Debug log
            sendResponse({status: 'Stopped recording'});
            break;
            
        case 'getEvents':
            sendResponse({events: events});
            break;
    }
    return true; // Keep message channel open for async responses
});

// Add initialization message
console.log('Content script loaded');
chrome.runtime.sendMessage({ 
    action: 'contentScriptLoaded', 
    url: window.location.href 
});

// Enhanced navigation monitoring
let lastUrl = window.location.href;

// Listen for URL changes
function checkURLchange() {
    if (window.location.href !== lastUrl) {
        addEvent('navigation', {
            fromUrl: lastUrl,
            toUrl: window.location.href
        });
        lastUrl = window.location.href;
    }
}

// Check URL changes on regular intervals
setInterval(checkURLchange, 500);

// Listen for history changes
window.addEventListener('popstate', checkURLchange);
window.addEventListener('hashchange', checkURLchange);

// Monitor all clicks
document.addEventListener('click', (e) => {
    if (!recording) return;
    
    addEvent('click', {
        xpath: getXPath(e.target),
        tagName: e.target.tagName.toLowerCase(),
        text: e.target.textContent.trim(),
        url: window.location.href
    });
}, true);

// Monitor all inputs
document.addEventListener('input', (e) => {
    if (!recording) return;
    
    addEvent('input', {
        xpath: getXPath(e.target),
        value: e.target.value,
        tagName: e.target.tagName.toLowerCase(),
        url: window.location.href
    });
}, true);

// Monitor keypresses
document.addEventListener('keydown', (e) => {
    if (!recording) return;
    
    if (['Enter', 'Tab', 'Escape'].includes(e.key)) {
        addEvent('keypress', {
            key: e.key,
            xpath: getXPath(e.target),
            url: window.location.href
        });
    }
}, true); 