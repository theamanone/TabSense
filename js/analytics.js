class TabAnalytics {
    constructor() {
        this.metrics = {
            tabHistory: [],
            taskHistory: [],
            memoryUsage: []
        };
        this.loadMetrics();
    }

    async loadMetrics() {
        const data = await chrome.storage.local.get('metrics');
        this.metrics = data.metrics || {
            tabHistory: [],
            taskHistory: [],
            memoryUsage: []
        };
    }

    async saveMetrics() {
        await chrome.storage.local.set({ metrics: this.metrics });
    }

    async getMemoryUsage() {
        try {
            const memory = await chrome.system.memory.getInfo();
            const usage = {
                total: memory.capacity - memory.availableCapacity,
                timestamp: Date.now()
            };
            
            this.metrics.memoryUsage.push(usage);
            if (this.metrics.memoryUsage.length > 100) {
                this.metrics.memoryUsage.shift();
            }
            
            await this.saveMetrics();
            return usage;
        } catch (error) {
            console.error('Error getting memory usage:', error);
            return { total: 0, timestamp: Date.now() };
        }
    }

    async trackTabEvent(tab, event) {
        const tabEvent = {
            tabId: tab.id,
            url: tab.url,
            title: tab.title,
            event: event,
            timestamp: Date.now()
        };
        
        this.metrics.tabHistory.push(tabEvent);
        if (this.metrics.tabHistory.length > 1000) {
            this.metrics.tabHistory.shift();
        }
        
        await this.saveMetrics();
    }

    async trackTask(task) {
        const taskEvent = {
            taskId: task.id,
            name: task.name,
            startTime: Date.now()
        };
        
        this.metrics.taskHistory.push(taskEvent);
        if (this.metrics.taskHistory.length > 100) {
            this.metrics.taskHistory.shift();
        }
        
        await this.saveMetrics();
    }

    async resetData() {
        this.metrics = {
            tabHistory: [],
            taskHistory: [],
            memoryUsage: []
        };
        await chrome.storage.local.remove('metrics');
        await this.saveMetrics();
    }
}

// Export for use in popup.js
window.TabAnalytics = TabAnalytics;
