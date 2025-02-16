class SpaceflightNews {
    constructor() {
        this.apiUrl = 'https://api.spaceflightnewsapi.net/v4/articles';
        this.newsGrid = document.getElementById('newsGrid');
        this.loading = document.getElementById('loading');
        this.error = document.getElementById('error');
        this.pagination = document.getElementById('pagination');
        this.searchForm = document.getElementById('searchForm');
        this.searchInput = document.getElementById('searchInput');
        this.showAllBtn = document.getElementById('showAllBtn');
        this.cachedNews = null;
        this.cacheExpiration = 5 * 60 * 1000; // 5 minutes
        this.pageSize = 12;
        this.currentPage = 1;
        this.totalPages = 1;
        this.currentSearchTerm = '';
        this.isCompactView = true;
        this.weatherApiKey = "fb1f2f7af34d8376fe74547c6279d6fb"; // Will be set from environment
        this.theme = localStorage.getItem('theme') || 'dark';
        this.userPreferences = {
            clockFormat: '24',
            tempUnit: 'metric',
            city: 'London',
            widgets: {
                clock: true,
                weather: true,
                shortcuts: true
            }
        };
        this.init();
    }

    async init() {
        feather.replace();
        await this.loadConfig();
        await this.loadPreferences();
        this.setupEventListeners();
        this.initializeWidgets();
        this.initializeTheme();
        await this.loadNews();
    }

    initializeTheme() {
        document.documentElement.setAttribute('data-theme', this.theme);
        document.getElementById(this.theme + 'Mode').checked = true;
    }

    async loadPreferences() {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            try {
                const prefs = await chrome.storage.local.get(['userPreferences']);
                if (prefs.userPreferences) {
                    this.userPreferences = { ...this.userPreferences, ...prefs.userPreferences };
                }
                this.applyPreferences();
            } catch (error) {
                console.error('Error loading preferences:', error);
            }
        }
    }

    applyPreferences() {
        Object.entries(this.userPreferences.widgets).forEach(([widget, enabled]) => {
            const toggle = document.getElementById(`${widget}Toggle`);
            const widgetElement = document.getElementById(`${widget}Widget`);
            if (toggle && widgetElement) {
                toggle.checked = enabled;
                widgetElement.parentElement.style.display = enabled ? 'block' : 'none';
            }
        });

        const clockFormat = document.querySelector(`input[name="clockFormat"][value="${this.userPreferences.clockFormat}"]`);
        if (clockFormat) clockFormat.checked = true;

        const tempUnit = document.querySelector(`input[name="tempUnit"][value="${this.userPreferences.tempUnit}"]`);
        if (tempUnit) tempUnit.checked = true;

        const cityInput = document.getElementById('cityInput');
        if (cityInput) cityInput.value = this.userPreferences.city;
    }

    async savePreferences() {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            try {
                await chrome.storage.local.set({ userPreferences: this.userPreferences });
            } catch (error) {
                console.error('Error saving preferences:', error);
            }
        }
    }

    setupEventListeners() {
        this.searchForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            this.currentPage = 1;
            this.currentSearchTerm = this.searchInput.value.trim();
            this.isCompactView = false;
            await this.loadNews(1);
            this.updateViewState();
        });

        this.showAllBtn.addEventListener('click', () => {
            this.isCompactView = false;
            this.updateViewState();
            this.loadNews(1);
        });

        document.getElementById('settingsBtn').addEventListener('click', () => {
            new bootstrap.Modal(document.getElementById('settingsModal')).show();
        });

        ['clock', 'weather', 'shortcuts'].forEach(widget => {
            document.getElementById(`${widget}Toggle`).addEventListener('change', (e) => {
                const enabled = e.target.checked;
                localStorage.setItem(`${widget}Enabled`, enabled);
                const widgetElement = document.getElementById(`${widget}Widget`);
                if (widgetElement) {
                    widgetElement.parentElement.style.display = enabled ? 'block' : 'none';
                }
            });
        });

        document.querySelectorAll('input[name="clockFormat"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.userPreferences.clockFormat = e.target.value;
                this.savePreferences();
                this.updateClock();
            });
        });

        document.querySelectorAll('input[name="tempUnit"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.userPreferences.tempUnit = e.target.value;
                this.savePreferences();
                this.initWeather();
            });
        });

        document.getElementById('saveCity').addEventListener('click', () => {
            const cityInput = document.getElementById('cityInput');
            if (cityInput && cityInput.value.trim()) {
                this.userPreferences.city = cityInput.value.trim();
                this.savePreferences();
                this.initWeather();
            }
        });

        document.querySelectorAll('input[name="themeMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.theme = e.target.value;
                document.documentElement.setAttribute('data-theme', this.theme);
                localStorage.setItem('theme', this.theme);
            });
        });

        document.querySelector('.add-shortcut-btn').addEventListener('click', () => {
            this.addNewShortcut();
        });
    }

    updateViewState() {
        this.showAllBtn.style.display = this.isCompactView ? 'inline-block' : 'none';
        this.pagination.classList.toggle('d-none', this.isCompactView);
    }

    buildApiUrl(page) {
        const offset = (page - 1) * this.pageSize;
        let url = `${this.apiUrl}?limit=${this.isCompactView ? 6 : this.pageSize}&offset=${offset}`;

        if (this.currentSearchTerm) {
            url += `&title_contains=${encodeURIComponent(this.currentSearchTerm)}`;
            url += `&summary_contains=${encodeURIComponent(this.currentSearchTerm)}`;
        }

        return url;
    }

    async loadNews(page = 1) {
        try {
            this.loading.classList.remove('d-none');
            this.error.classList.add('d-none');

            if (typeof chrome !== 'undefined' && chrome.storage) {
                const cachedData = await this.getCachedNews(page, this.currentSearchTerm);
                if (cachedData) {
                    this.displayNews(cachedData);
                    return;
                }
            }

            const response = await fetch(this.buildApiUrl(page));
            if (!response.ok) throw new Error('Network response was not ok');

            const data = await response.json();

            if (typeof chrome !== 'undefined' && chrome.storage) {
                await this.cacheNews(data, page, this.currentSearchTerm);
            }

            this.displayNews(data);
        } catch (error) {
            console.error('Error loading news:', error);
            this.showError();
        }
    }

    async initializeWidgets() {
        this.initClock();
        await this.initWeather();
        await this.loadShortcuts();
        await this.loadWidgetStates();
    }

    loadWidgetStates() {
        ['clock', 'weather', 'shortcuts'].forEach(widget => {
            const enabled = localStorage.getItem(`${widget}Enabled`) !== 'false';
            document.getElementById(`${widget}Toggle`).checked = enabled;
            const widgetElement = document.getElementById(`${widget}Widget`);
            if (widgetElement) {
                widgetElement.parentElement.style.display = enabled ? 'block' : 'none';
            }
        });
    }

    initClock() {
        this.updateClock();
        setInterval(() => this.updateClock(), 1000);
    }

    updateClock() {
        const now = new Date();
        const clockElement = document.querySelector('.digital-clock');
        const dateElement = document.querySelector('.date');

        if (clockElement && dateElement) {
            clockElement.textContent = now.toLocaleTimeString('en-US', {
                hour12: this.userPreferences.clockFormat === '12',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            dateElement.textContent = now.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        }
    }

    async initWeather() {
        try {
            const weatherContent = document.querySelector('.weather-content');
            if (!weatherContent) return;

            weatherContent.innerHTML = '<div class="weather-loading">Loading weather...</div>';

            const weatherData = await this.fetchWeather();
            if (!weatherData) return;

            const tempUnit = this.userPreferences.tempUnit === 'metric' ? '°C' : '°F';
            weatherContent.innerHTML = `
                <div class="weather-icon">
                    <img src="https://openweathermap.org/img/wn/${weatherData.weather[0].icon}@2x.png" alt="${weatherData.weather[0].description}">
                </div>
                <div class="weather-temp">${Math.round(weatherData.main.temp)}${tempUnit}</div>
                <div class="weather-desc">${weatherData.weather[0].description}</div>
                <div class="weather-location">${weatherData.name}</div>
            `;
        } catch (error) {
            console.error('Weather error:', error);
            document.querySelector('.weather-content').innerHTML =
                '<div class="weather-error">Unable to load weather</div>';
        }
    }

    async fetchWeather() {
        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(this.userPreferences.city)}&units=${this.userPreferences.tempUnit}&appid=${this.weatherApiKey}`
        );
        if (!response.ok) throw new Error('Weather API error');
        return response.json();
    }

    getCurrentPosition() {
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
        });
    }


    async loadShortcuts() {
        if (typeof chrome === 'undefined' || !chrome.storage) {
            console.error('Chrome storage API not available');
            return;
        }

        try {
            const { shortcuts = [] } = await chrome.storage.local.get(['shortcuts']);
            this.renderShortcuts(shortcuts);
        } catch (error) {
            console.error('Error loading shortcuts:', error);
        }
    }

    async addNewShortcut() {
        const url = prompt('Enter website URL:');
        if (!url) return;

        try {
            const urlObj = new URL(url);
            const favicon = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;
            const shortcut = { url: urlObj.href, favicon };

            if (typeof chrome !== 'undefined' && chrome.storage) {
                const { shortcuts = [] } = await chrome.storage.local.get(['shortcuts']);
                shortcuts.push(shortcut);
                await chrome.storage.local.set({ shortcuts });
                this.renderShortcuts(shortcuts);
            } else {
                console.error('Chrome storage API not available');
                alert('Unable to save shortcut. Extension storage not available.');
            }
        } catch (error) {
            console.error('Error adding shortcut:', error);
            alert('Please enter a valid URL (including http:// or https://)');
        }
    }

    async deleteShortcut(index) {
        if (typeof chrome === 'undefined' || !chrome.storage) {
            console.error('Chrome storage API not available');
            return;
        }

        try {
            const { shortcuts = [] } = await chrome.storage.local.get(['shortcuts']);
            shortcuts.splice(index, 1);
            await chrome.storage.local.set({ shortcuts });
            this.renderShortcuts(shortcuts);
        } catch (error) {
            console.error('Error deleting shortcut:', error);
            alert('Unable to delete shortcut. Please try again.');
        }
    }

    renderShortcuts(shortcuts = []) {
        const grid = document.querySelector('.shortcuts-grid');
        if (!grid) {
            console.error('Shortcuts grid element not found');
            return;
        }

        const shortcutsHtml = shortcuts.map((shortcut, index) => `
            <div class="shortcut-wrapper">
                <a href="${shortcut.url}" class="shortcut-item" title="${shortcut.url}">
                    <img src="${shortcut.favicon}" alt="">
                </a>
                <button class="shortcut-delete" data-index="${index}">
                    <i data-feather="x"></i>
                </button>
            </div>
        `).join('');

        grid.innerHTML = `
            ${shortcutsHtml}
            <button class="add-shortcut-btn">
                <i data-feather="plus"></i>
            </button>
        `;
        feather.replace();

        grid.querySelectorAll('.shortcut-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                this.deleteShortcut(index);
            });
        });

        const addButton = grid.querySelector('.add-shortcut-btn');
        if (addButton) {
            addButton.addEventListener('click', () => this.addNewShortcut());
        }
    }

    async getCachedNews(page, searchTerm) {
        try {
            const key = `newsCache_page_${page}_search_${searchTerm}`;
            const cached = await chrome.storage.local.get([key, 'timestamp']);
            if (!cached[key] || !cached.timestamp) return null;

            const now = Date.now();
            if (now - cached.timestamp > this.cacheExpiration) return null;

            return cached[key];
        } catch (error) {
            console.warn('Cache access error:', error);
            return null;
        }
    }

    async cacheNews(data, page, searchTerm) {
        try {
            const key = `newsCache_page_${page}_search_${searchTerm}`;
            await chrome.storage.local.set({
                [key]: data,
                timestamp: Date.now()
            });
        } catch (error) {
            console.warn('Cache write error:', error);
        }
    }

    createPagination(totalResults) {
        this.totalPages = Math.ceil(totalResults / this.pageSize);
        const maxVisiblePages = 5;
        let paginationHtml = '<nav aria-label="News navigation"><ul class="pagination justify-content-center">';

        paginationHtml += `
            <li class="page-item ${this.currentPage === 1 ? 'disabled' : ''}">
                <a class="page-link" href="#" data-page="${this.currentPage - 1}">Previous</a>
            </li>
        `;

        let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(this.totalPages, startPage + maxVisiblePages - 1);

        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        if (startPage > 1) {
            paginationHtml += `
                <li class="page-item">
                    <a class="page-link" href="#" data-page="1">1</a>
                </li>
                ${startPage > 2 ? '<li class="page-item disabled"><span class="page-link">...</span></li>' : ''}
            `;
        }

        for (let i = startPage; i <= endPage; i++) {
            paginationHtml += `
                <li class="page-item ${i === this.currentPage ? 'active' : ''}">
                    <a class="page-link" href="#" data-page="${i}">${i}</a>
                </li>
            `;
        }

        if (endPage < this.totalPages) {
            paginationHtml += `
                ${endPage < this.totalPages - 1 ? '<li class="page-item disabled"><span class="page-link">...</span></li>' : ''}
                <li class="page-item">
                    <a class="page-link" href="#" data-page="${this.totalPages}">${this.totalPages}</a>
                </li>
            `;
        }

        paginationHtml += `
            <li class="page-item ${this.currentPage === this.totalPages ? 'disabled' : ''}">
                <a class="page-link" href="#" data-page="${this.currentPage + 1}">Next</a>
            </li>
        `;

        paginationHtml += '</ul></nav>';
        this.pagination.innerHTML = paginationHtml;

        this.pagination.querySelectorAll('.page-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = parseInt(e.target.dataset.page);
                if (page && page !== this.currentPage) {
                    this.currentPage = page;
                    this.loadNews(page);
                }
            });
        });
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 60) {
            return `${diffMins}m ago`;
        } else if (diffHours < 24) {
            return `${diffHours}h ago`;
        } else if (diffDays < 7) {
            return `${diffDays}d ago`;
        } else {
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
            });
        }
    }

    createNewsCard(article) {
        const authors = article.authors.map(author => author.name).join(', ');
        return `
            <a href="${article.url}" target="_blank" rel="noopener noreferrer" class="text-decoration-none">
                <div class="news-card">
                    <img src="${article.image_url}" alt="${article.title}"
                         onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0DovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJmZWF0aGVyIGZlYXRoZXItaW1hZ2UiPjxyZWN0IHg9IjMiIHk9IjMiIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgcng9IjIiIHJ5PSIyIj48L3JlY3Q+PGNpcmNsZSBjeD0iOC41IiBjeT0iOC41IiByPSIxLjUiPjwvY2lyY2xlPjxwb2x5bGluZSBwb2ludHM9IjIxIDE1IDEwIDIxIDMgMTUiPjwvcG9seWxpbmU+PC9zdmc+'"
                         loading="lazy">
                    <div class="news-card-content">
                        <h2 class="news-card-title">${article.title}</h2>
                        <p class="news-card-summary">${article.summary}</p>
                        <div class="news-card-meta">
                            <span class="news-source">${article.news_site}</span>
                            <span>${this.formatDate(article.published_at)}</span>
                        </div>
                        ${authors ? `<div class="news-card-authors">By ${authors}</div>` : ''}
                    </div>
                </div>
            </a>
        `;
    }

    displayNews(data) {
        this.loading.classList.add('d-none');
        this.error.classList.add('d-none');

        const newsHTML = data.results
            .map(article => this.createNewsCard(article))
            .join('');

        this.newsGrid.innerHTML = newsHTML;
        this.createPagination(data.count);
    }

    showError() {
        this.loading.classList.add('d-none');
        this.error.classList.remove('d-none');
        this.pagination.innerHTML = '';
    }

    async loadConfig() {
        try {
            const response = await fetch('/config');
            const config = await response.json();
            this.weatherApiKey = config.weatherApiKey;
        } catch (error) {
            console.error('Error loading config:', error);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SpaceflightNews();
});