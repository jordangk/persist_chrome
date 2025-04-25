/**
 * PersistIQ Chrome Extension
 * Background script for handling extension functionality
 */

// Listen for installation to initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('PersistIQ Lead Manager extension installed');
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getApiKey') {
    // Get API key from storage and send back to requesting script
    chrome.storage.local.get('apiKey', (result) => {
      sendResponse({ apiKey: result.apiKey });
    });
    return true; // Indicates we will respond asynchronously
  }
});