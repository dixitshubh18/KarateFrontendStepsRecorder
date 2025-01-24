// Initialize recording state
let recordingState = {
  isRecording: false,
  events: []
};

// Restore state from storage on startup
chrome.storage.local.get(['isRecording', 'events'], (result) => {
  recordingState = {
    isRecording: result.isRecording || false,
    events: result.events || []
  };
});

// Listen for installation or update
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    isRecording: false,
    events: []
  });
});

// Handle messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request.action); // Debug log
  
  switch (request.action) {
    case 'getRecordingState':
      sendResponse(recordingState);
      break;
    
    case 'updateRecordingState':
      recordingState = {
        ...recordingState,
        ...request.state
      };
      // Persist to storage
      chrome.storage.local.set(recordingState, () => {
        console.log('State updated:', recordingState); // Debug log
      });
      
      // Notify all tabs about the state change
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            action: 'recordingStateChanged',
            state: recordingState
          }).catch(() => {}); // Ignore errors for inactive tabs
        });
      });
      
      sendResponse(recordingState);
      break;
    
    case 'addEvent':
      if (recordingState.isRecording) {
        recordingState.events.push(request.event);
        chrome.storage.local.set({ events: recordingState.events });
        console.log('Event added:', request.event); // Debug log
        
        // Notify popup to update event count
        chrome.runtime.sendMessage({
          action: 'updateEventCount',
          count: recordingState.events.length
        }).catch(() => {}); // Ignore if popup is closed
      }
      break;
    
    case 'contentScriptLoaded':
      console.log('Content script loaded in tab:', sender.tab.id);
      break;
  }
  return true; // Keep message channel open for async responses
});

// When a tab is updated, inject content script if recording is active
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && recordingState.isRecording) {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    }).then(() => {
      chrome.tabs.sendMessage(tabId, {
        action: 'recordingStateChanged',
        state: recordingState
      });
    }).catch(error => console.error('Error injecting content script:', error));
  }
}); 
