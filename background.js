// Performance metrics storage
let tabMetrics = new Map();

// Listen for tab updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        updateTabStatistics();
        await measureTabPerformance(tabId);
    }
});

// Listen for tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
    tabMetrics.delete(tabId);
    updateTabStatistics();
});

// Update tab statistics
async function updateTabStatistics() {
    const tabs = await chrome.tabs.query({});
    const groups = await chrome.tabGroups.query({});
    
    // Calculate total memory usage
    const memoryInfo = await getMemoryUsage();
    
    // Store statistics
    chrome.storage.local.set({
        tabCount: tabs.length,
        groupCount: groups.length,
        memoryUsage: memoryInfo,
        lastUpdated: new Date().toISOString()
    });
}

// Measure tab performance
async function measureTabPerformance(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        const metrics = {
            timestamp: Date.now(),
            url: tab.url,
            title: tab.title,
            loadTime: await getTabLoadTime(tabId),
            memoryUsage: await getTabMemoryUsage(tabId)
        };
        
        tabMetrics.set(tabId, metrics);
        
        // Auto-hibernate heavy tabs
        if (metrics.memoryUsage > 200) { // More than 200MB
            await autoHibernateLowPriorityTab(tabId);
        }
    } catch (error) {
        console.error('Error measuring tab performance:', error);
    }
}

// Get tab load time
async function getTabLoadTime(tabId) {
    return new Promise(resolve => {
        chrome.tabs.executeScript(tabId, {
            code: 'window.performance.timing.loadEventEnd - window.performance.timing.navigationStart'
        }, result => {
            resolve(result[0] || 0);
        });
    });
}

// Get tab memory usage
async function getTabMemoryUsage(tabId) {
    return new Promise(resolve => {
        chrome.tabs.executeScript(tabId, {
            code: 'performance.memory ? performance.memory.usedJSHeapSize / 1024 / 1024 : 0'
        }, result => {
            resolve(result[0] || 0);
        });
    });
}

// Get overall memory usage
async function getMemoryUsage() {
    const tabs = await chrome.tabs.query({});
    let totalMemory = 0;
    
    for (const tab of tabs) {
        const metrics = tabMetrics.get(tab.id);
        if (metrics) {
            totalMemory += metrics.memoryUsage;
        }
    }
    
    return totalMemory;
}

// Auto-hibernate low priority tabs
async function autoHibernateLowPriorityTab(tabId) {
    const tab = await chrome.tabs.get(tabId);
    const metrics = tabMetrics.get(tabId);
    
    // Don't hibernate if tab is active or pinned
    if (tab.active || tab.pinned) return;
    
    // Don't hibernate if tab was recently used
    const lastUsed = metrics.timestamp;
    const now = Date.now();
    if (now - lastUsed < 30 * 60 * 1000) return; // 30 minutes
    
    chrome.tabs.discard(tabId);
}

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
    updateTabStatistics();
    
    // Set up periodic cleanup
    setInterval(cleanupOldMetrics, 30 * 60 * 1000); // Every 30 minutes
});

// Cleanup old metrics
function cleanupOldMetrics() {
    const now = Date.now();
    for (const [tabId, metrics] of tabMetrics.entries()) {
        if (now - metrics.timestamp > 24 * 60 * 60 * 1000) { // 24 hours
            tabMetrics.delete(tabId);
        }
    }
}
