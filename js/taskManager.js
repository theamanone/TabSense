class TaskManager {
    constructor() {
        this.currentTask = null;
        this.tasks = [];
        this.taskPatterns = {
            development: {
                domains: ['github.com', 'stackoverflow.com', 'developer.mozilla.org', 'gitlab.com'],
                icon: '👨‍💻'
            },
            research: {
                domains: ['google.com', 'scholar.google.com', 'wikipedia.org', 'researchgate.net'],
                icon: '🔍'
            },
            communication: {
                domains: ['gmail.com', 'outlook.com', 'slack.com', 'teams.microsoft.com'],
                icon: '💬'
            },
            productivity: {
                domains: ['notion.so', 'trello.com', 'asana.com', 'monday.com'],
                icon: '📊'
            },
            learning: {
                domains: ['coursera.org', 'udemy.com', 'edx.org', 'linkedin.com/learning'],
                icon: '📚'
            },
            social: {
                domains: ['twitter.com', 'linkedin.com', 'facebook.com', 'instagram.com'],
                icon: '🌐'
            }
        };
        this.loadTasks();
    }

    async loadTasks() {
        const data = await chrome.storage.local.get('tasks');
        this.tasks = data.tasks || [];
    }

    async saveTasks() {
        await chrome.storage.local.set({ tasks: this.tasks });
    }

    async analyzeUserBehavior(tabs) {
        const domains = tabs.map(tab => {
            try {
                return new URL(tab.url).hostname;
            } catch (e) {
                return '';
            }
        });

        const taskScores = {};
        for (const [taskType, pattern] of Object.entries(this.taskPatterns)) {
            taskScores[taskType] = this.calculateTaskScore(domains, pattern.domains);
        }

        const dominantTask = Object.entries(taskScores)
            .reduce((a, b) => (a[1] > b[1] ? a : b))[0];

        this.currentTask = {
            type: dominantTask,
            name: this.formatTaskName(dominantTask),
            icon: this.taskPatterns[dominantTask].icon,
            timestamp: Date.now(),
            tabCount: tabs.length,
            domains: domains
        };

        this.tasks.push(this.currentTask);
        if (this.tasks.length > 100) {
            this.tasks = this.tasks.slice(-100);
        }

        await this.saveTasks();
        return this.currentTask;
    }

    calculateTaskScore(currentDomains, patternDomains) {
        let score = 0;
        for (const domain of currentDomains) {
            if (patternDomains.some(pattern => domain.includes(pattern))) {
                score++;
            }
        }
        return score;
    }

    formatTaskName(taskType) {
        return taskType.charAt(0).toUpperCase() + taskType.slice(1) + ' Session';
    }

    async getSuggestions() {
        if (!this.currentTask) return [];

        const suggestions = [];
        const { type, domains } = this.currentTask;

        // Suggest grouping if many tabs of the same type
        if (domains.length > 3) {
            suggestions.push({
                text: 'Group related tabs for better organization',
                action: 'smartGroup',
                icon: '📑'
            });
        }

        // Suggest optimization if too many tabs
        if (domains.length > 10) {
            suggestions.push({
                text: 'Optimize tabs to improve performance',
                action: 'optimize',
                icon: '⚡'
            });
        }

        // Suggest focus mode for work/study tasks
        if (['development', 'research', 'learning'].includes(type)) {
            suggestions.push({
                text: 'Enable focus mode to stay productive',
                action: 'focus',
                icon: '🎯'
            });
        }

        return suggestions;
    }

    async getTaskHistory() {
        return this.tasks.slice(-10).reverse();
    }

    async clearHistory() {
        this.tasks = [];
        this.currentTask = null;
        await this.saveTasks();
    }

    async getCurrentTask() {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length === 0) return { name: 'No active task' };

        const currentTab = tabs[0];
        const domain = new URL(currentTab.url).hostname;
        
        // Find or create task based on domain
        let task = this.tasks.find(t => t.domain === domain);
        if (!task) {
            task = {
                name: domain,
                domain: domain,
                created: Date.now()
            };
            this.tasks.push(task);
            await this.saveTasks();
        }
        
        return task;
    }

    async groupTabsByDomain(tabs) {
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
                        collapsed: false
                    });
                } catch (error) {
                    console.error('Error creating group for domain:', domain, error);
                }
            }
        }
    }

    async findRelatedTabs(currentTab) {
        const allTabs = await chrome.tabs.query({ currentWindow: true });
        const currentDomain = new URL(currentTab.url).hostname;
        
        return allTabs.filter(tab => {
            try {
                const domain = new URL(tab.url).hostname;
                return domain === currentDomain && tab.id !== currentTab.id;
            } catch {
                return false;
            }
        });
    }

    async getInactiveTabs() {
        const settings = await chrome.storage.local.get('inactiveTimeout');
        const timeout = settings.inactiveTimeout || 30; // Default 30 minutes
        const cutoff = Date.now() - (timeout * 60 * 1000);
        
        const tabs = await chrome.tabs.query({ currentWindow: true });
        return tabs.filter(tab => {
            return !tab.active && !tab.pinned && tab.lastAccessed < cutoff;
        });
    }
}

// Export for use in popup.js
window.TaskManager = TaskManager;
