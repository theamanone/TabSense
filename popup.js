// Initialize TaskManager and Analytics
const taskManager = new TaskManager();
const analytics = new TabAnalytics();

// Load settings
async function loadSettings() {
    const data = await chrome.storage.local.get('settings');
    return data.settings || {
        autoGroup: true,
        inactiveTimeout: 30,
        focusAction: 'minimize',
        collectAnalytics: true
    };
}

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize UI
    await updateStats();
    await loadTabs();
    
    // Smart Group Button
    document.getElementById('smartGroup').addEventListener('click', async () => {
        try {
            const tabs = await chrome.tabs.query({ currentWindow: true });
            await groupTabs(tabs);
            showNotification('Tabs grouped successfully!', 'success');
        } catch (error) {
            showNotification('Error grouping tabs', 'error');
            console.error('Smart Group error:', error);
        }
    });

    // Optimize Button
    document.getElementById('optimize').addEventListener('click', async () => {
        try {
            const tabs = await chrome.tabs.query({ currentWindow: true });
            let optimizedCount = 0;
            
            // Remove duplicate tabs
            const seen = new Map();
            const duplicates = [];
            
            for (const tab of tabs) {
                const url = new URL(tab.url).href.split('#')[0]; // Ignore hash
                if (seen.has(url)) {
                    duplicates.push(tab.id);
                    optimizedCount++;
                } else {
                    seen.set(url, tab.id);
                }
            }
            
            if (duplicates.length > 0) {
                await chrome.tabs.remove(duplicates);
            }
            
            // Get settings for inactive timeout
            const settings = await loadSettings();
            const cutoff = Date.now() - (settings.inactiveTimeout * 60 * 1000);
            
            // Hibernate inactive tabs
            const inactiveTabs = tabs.filter(tab => {
                return !tab.active && !tab.pinned && (!tab.lastAccessed || tab.lastAccessed < cutoff);
            });
            
            for (const tab of inactiveTabs) {
                try {
                    await chrome.tabs.discard(tab.id);
                    optimizedCount++;
                } catch (error) {
                    console.error('Error discarding tab:', error);
                }
            }
            
            await updateStats();
            showNotification(`Optimized ${optimizedCount} tabs successfully!`, 'success');
        } catch (error) {
            showNotification('Error optimizing tabs', 'error');
            console.error('Optimize error:', error);
        }
    });

    // Focus Mode Button
    document.getElementById('focus').addEventListener('click', async () => {
        try {
            const settings = await loadSettings();
            const currentTab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
            const relatedTabs = await taskManager.findRelatedTabs(currentTab);
            
            // Group related tabs
            if (relatedTabs.length > 0) {
                const tabIds = [currentTab.id, ...relatedTabs.map(tab => tab.id)];
                const groupId = await chrome.tabs.group({ tabIds });
                await chrome.tabGroups.update(groupId, {
                    title: 'Focus',
                    color: 'blue'
                });
            }
            
            // Handle other tabs based on settings
            const otherTabs = await chrome.tabs.query({ 
                currentWindow: true,
                pinned: false
            });
            
            for (const tab of otherTabs) {
                if (!relatedTabs.map(t => t.id).includes(tab.id) && tab.id !== currentTab.id) {
                    switch (settings.focusAction) {
                        case 'minimize':
                            await chrome.tabs.update(tab.id, { highlighted: false });
                            break;
                        case 'hibernate':
                            await chrome.tabs.discard(tab.id);
                            break;
                        case 'close':
                            await chrome.tabs.remove(tab.id);
                            break;
                    }
                }
            }
            
            showNotification('Focus mode activated!', 'success');
        } catch (error) {
            showNotification('Error activating focus mode', 'error');
            console.error('Focus mode error:', error);
        }
    });

    // Reset Analytics Button
    document.getElementById('resetAnalytics').addEventListener('click', async () => {
        if (confirm('Are you sure you want to reset all analytics data? This cannot be undone.')) {
            try {
                await analytics.resetData();
                await updateStats();
                showNotification('Analytics data reset successfully!', 'success');
            } catch (error) {
                showNotification('Error resetting analytics', 'error');
                console.error('Reset analytics error:', error);
            }
        }
    });

    // Settings Button
    document.getElementById('openSettings').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    // Auto-group functionality
    chrome.tabs.onCreated.addListener(async (tab) => {
        const settings = await loadSettings();
        if (settings.autoGroup) {
            const tabs = await chrome.tabs.query({ currentWindow: true });
            await groupTabs([tab]);
        }
    });
});

// Helper Functions
async function groupTabs(tabs) {
    const domains = new Map();
    
    // Group tabs by domain
    for (const tab of tabs) {
        try {
            const url = new URL(tab.url);
            const domain = url.hostname;
            
            if (!domains.has(domain)) {
                domains.set(domain, []);
            }
            domains.get(domain).push(tab);
        } catch (error) {
            console.error('Invalid URL:', tab.url);
        }
    }
    
    // Create groups for domains with multiple tabs
    for (const [domain, domainTabs] of domains) {
        if (domainTabs.length > 1) {
            const tabIds = domainTabs.map(tab => tab.id);
            try {
                const groupId = await chrome.tabs.group({ tabIds });
                await chrome.tabGroups.update(groupId, {
                    title: domain.replace('www.', ''),
                    color: getRandomGroupColor()
                });
            } catch (error) {
                console.error('Error creating group for domain:', domain, error);
            }
        }
    }
}

async function updateStats() {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const memoryInfo = await analytics.getMemoryUsage();
    
    document.getElementById('tabCount').textContent = tabs.length;
    document.getElementById('memoryUsage').textContent = formatMemory(memoryInfo.total);
    
    // Update task analysis
    const currentTask = await taskManager.getCurrentTask();
    const taskElement = document.getElementById('currentTask');
    taskElement.querySelector('.task-name').textContent = currentTask.name || 'No active task';
}

async function loadTabs() {
    const tabList = document.getElementById('tabList');
    const tabs = await chrome.tabs.query({ currentWindow: true });
    
    tabList.innerHTML = '';
    
    for (const tab of tabs) {
        const tabElement = createTabElement(tab);
        tabList.appendChild(tabElement);
    }
}

function createTabElement(tab) {
    const div = document.createElement('div');
    div.className = 'tab-item slide-in';
    
    div.innerHTML = `
        <img class="tab-favicon" src="${tab.favIconUrl || 'icons/default-favicon.png'}" alt="">
        <div class="tab-info">
            <div class="tab-title">${tab.title}</div>
            <div class="tab-url">${tab.url}</div>
        </div>
        <button class="close-tab" data-tab-id="${tab.id}">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
        </button>
    `;
    
    // Add click handlers
    div.querySelector('.close-tab').addEventListener('click', async (e) => {
        e.stopPropagation();
        const tabId = parseInt(e.currentTarget.dataset.tabId);
        await chrome.tabs.remove(tabId);
        div.remove();
        await updateStats();
    });
    
    div.addEventListener('click', () => {
        chrome.tabs.update(tab.id, { active: true });
    });
    
    return div;
}

function getRandomGroupColor() {
    const colors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
    return colors[Math.floor(Math.random() * colors.length)];
}

function formatMemory(bytes) {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type} slide-in`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}
