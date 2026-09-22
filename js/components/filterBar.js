// ============================================================================
// js/components/filterBar.js
// Interactive Filter Toolbar & Active Chips Component
// ============================================================================

import { getGenreName } from '../utils/dom.js';

export class FilterBar {
    constructor(onFilterChange) {
        this.onFilterChange = onFilterChange;
        this.state = {
            mediaType: 'all',
            genre: 'all',
            year: 'all',
            sort: 'popularity.desc'
        };

        this.typeContainer = document.getElementById('media-type-control');
        this.genreSelect = document.getElementById('genre-filter');
        this.yearSelect = document.getElementById('year-filter');
        this.sortSelect = document.getElementById('sort-filter');
        this.chipsList = document.getElementById('chips-list');
        this.clearBtn = document.getElementById('clear-filters-btn');
        this.resultsCountEl = document.getElementById('results-count');

        this._bindEvents();
    }

    _bindEvents() {
        // Media Type Buttons
        this.typeContainer?.addEventListener('click', (e) => {
            const btn = e.target.closest('.segment-btn');
            if (!btn) return;

            this.typeContainer.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            this.state.mediaType = btn.dataset.type;
            this._notifyChange();
        });

        // Dropdowns
        this.genreSelect?.addEventListener('change', (e) => {
            this.state.genre = e.target.value;
            this._notifyChange();
        });

        this.yearSelect?.addEventListener('change', (e) => {
            this.state.year = e.target.value;
            this._notifyChange();
        });

        this.sortSelect?.addEventListener('change', (e) => {
            this.state.sort = e.target.value;
            this._notifyChange();
        });

        // Clear all filters
        this.clearBtn?.addEventListener('click', () => {
            this.resetFilters();
        });

        // Grid View Switchers
        const gridBtn = document.getElementById('view-grid-btn');
        const listBtn = document.getElementById('view-list-btn');
        const mediaGrid = document.getElementById('media-grid');

        gridBtn?.addEventListener('click', () => {
            gridBtn.classList.add('active');
            listBtn?.classList.remove('active');
            mediaGrid?.classList.remove('list-layout');
        });

        listBtn?.addEventListener('click', () => {
            listBtn.classList.add('active');
            gridBtn?.classList.remove('active');
            mediaGrid?.classList.add('list-layout');
        });
    }

    _notifyChange() {
        this.renderChips();
        if (typeof this.onFilterChange === 'function') {
            this.onFilterChange(this.getFilters());
        }
    }

    getFilters() {
        return { ...this.state };
    }

    setResultsCount(count) {
        if (this.resultsCountEl) {
            this.resultsCountEl.innerHTML = `Showing <strong>${count}</strong> titles`;
        }
    }

    renderChips() {
        if (!this.chipsList) return;
        this.chipsList.innerHTML = '';

        const chips = [];
        if (this.state.genre !== 'all') {
            chips.push({ key: 'genre', label: `Genre: ${getGenreName(this.state.genre)}` });
        }
        if (this.state.year !== 'all') {
            chips.push({ key: 'year', label: `Year: ${this.state.year}` });
        }
        if (this.state.mediaType !== 'all') {
            chips.push({ key: 'mediaType', label: `Type: ${this.state.mediaType.toUpperCase()}` });
        }

        chips.forEach(chip => {
            const badge = document.createElement('span');
            badge.className = 'pill-badge';
            badge.style.background = '#1f2233';
            badge.style.color = '#fff';
            badge.style.cursor = 'pointer';
            badge.innerHTML = `${chip.label} <i class="fa-solid fa-xmark" style="font-size:0.65rem; margin-left:4px;"></i>`;
            badge.addEventListener('click', () => {
                if (chip.key === 'genre') this.genreSelect.value = 'all';
                if (chip.key === 'year') this.yearSelect.value = 'all';
                if (chip.key === 'mediaType') {
                    this.typeContainer.querySelector('[data-type="all"]')?.click();
                    return;
                }
                this.state[chip.key] = 'all';
                this._notifyChange();
            });
            this.chipsList.appendChild(badge);
        });

        this.clearBtn.style.display = chips.length > 0 ? 'inline-block' : 'none';
    }

    resetFilters() {
        this.state = { mediaType: 'all', genre: 'all', year: 'all', sort: 'popularity.desc' };
        if (this.genreSelect) this.genreSelect.value = 'all';
        if (this.yearSelect) this.yearSelect.value = 'all';
        if (this.sortSelect) this.sortSelect.value = 'popularity.desc';
        this.typeContainer?.querySelector('[data-type="all"]')?.click();
    }
}