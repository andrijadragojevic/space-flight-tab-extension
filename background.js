chrome.runtime.onInstalled.addListener(() => {
    // Clear any existing cache on installation/update
    chrome.storage.local.clear();
});
