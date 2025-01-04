// Default settings
const DEFAULT_SETTINGS = {
    autoGroup: true,
    inactiveTimeout: 30,
    focusAction: 'minimize',
    collectAnalytics: true
};

// Load settings when the page loads
document.addEventListener('DOMContentLoaded', async () => {
    const settings = await loadSettings();
    
    // Set initial values
    document.getElementById('autoGroup').checked = settings.autoGroup;
    document.getElementById('inactiveTimeout').value = settings.inactiveTimeout;
    document.getElementById('focusAction').value = settings.focusAction;
    document.getElementById('collectAnalytics').checked = settings.collectAnalytics;
    
    // Add event listeners
    document.getElementById('autoGroup').addEventListener('change', saveSettings);
    document.getElementById('inactiveTimeout').addEventListener('change', saveSettings);
    document.getElementById('focusAction').addEventListener('change', saveSettings);
    document.getElementById('collectAnalytics').addEventListener('change', saveSettings);
    
    // Clear data button
    document.getElementById('clearData').addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
            await chrome.storage.local.remove(['metrics', 'tasks']);
            showMessage('All data cleared successfully!');
        }
    });
});

async function loadSettings() {
    const data = await chrome.storage.local.get('settings');
    return { ...DEFAULT_SETTINGS, ...data.settings };
}

async function saveSettings() {
    const settings = {
        autoGroup: document.getElementById('autoGroup').checked,
        inactiveTimeout: parseInt(document.getElementById('inactiveTimeout').value),
        focusAction: document.getElementById('focusAction').value,
        collectAnalytics: document.getElementById('collectAnalytics').checked
    };
    
    await chrome.storage.local.set({ settings });
    showMessage('Settings saved!');
}

function showMessage(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }, 100);
}
