import { ItemView, WorkspaceLeaf, TFile, Notice, Modal, TextComponent, ButtonComponent } from 'obsidian';
import MonitoringPlugin from '../main';

export const MAIN_PAGE_VIEW_TYPE = 'monitoring-main-page-view';

interface TaskData {
    id: string;
    name: string;
    status: string;
    deadline: string;
    path: string;
    priority: number;
    tags: string[];
    linkedProject?: string;
}

interface ProjectData {
    id: string;
    name: string;
    status: string;
    path: string;
    goal: string;
    priority?: number;
    started?: string;
    target_date?: string;
}

interface IncidentData {
    id: string;
    name: string;
    status: string;
    date: string;
    path: string;
    sender: string;
}

export class MainPageView extends ItemView {
    plugin: MonitoringPlugin;
    activeTab: 'dashboard' | 'kanban' | 'calendar' = 'dashboard';
    calendarWeekOffset: number = 0;
    currentFilterId: number | null = null; // ID of the currently active saved filter

    constructor(leaf: WorkspaceLeaf, plugin: MonitoringPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return MAIN_PAGE_VIEW_TYPE;
    }

    getDisplayText() {
        return 'Панель управления';
    }

    getIcon() {
        return 'layout-dashboard';
    }

    private isRefreshing = false;

    async onOpen() {
        await this.refreshContent();
    }

    async refreshContent() {
        if (this.isRefreshing) return;
        if (!this.containerEl.parentElement) return; // Don't render if view is closed

        this.isRefreshing = true;
        try {
            const container = this.containerEl.children[1];
            container.empty();
            container.addClass('monitoring-main-page');

        // Header with Refresh Button
        const headerContainer = container.createDiv({ cls: 'main-page-header-container' });
        headerContainer.createEl('h2', { text: 'Панель управления', cls: 'main-page-header' });
        
        const btnGroup = headerContainer.createDiv({ cls: 'monitoring-header-btns' });
        
        const refreshBtn = btnGroup.createEl('button', { 
            cls: 'monitoring-refresh-btn',
            text: 'Обновить данные'
        });
        refreshBtn.onclick = () => this.refreshContent();

        const reportBtn = btnGroup.createEl('button', {
            cls: 'monitoring-report-btn',
            text: 'Сформировать отчет'
        });
        reportBtn.onclick = () => this.generateWeeklyReport();

        const addTaskBtn = btnGroup.createEl('button', {
            cls: 'monitoring-glass-btn monitoring-add-task',
            text: '+ Задачу'
        });
        addTaskBtn.onclick = () => {
            new NamingModal(this.app, "Создать новую задачу", async (name) => {
                const file = await this.plugin.templateManager.createTaskNote(name);
                await this.app.workspace.getLeaf(false).openFile(file);
                new Notice(`Задача "${name}" создана!`);
                this.refreshContent();
            }).open();
        };

        const addProjectBtn = btnGroup.createEl('button', {
            cls: 'monitoring-glass-btn monitoring-add-project',
            text: '+ Проект'
        });
        addProjectBtn.onclick = () => {
            new NamingModal(this.app, "Создать новый проект", async (name) => {
                const file = await this.plugin.templateManager.createProjectNote(name);
                await this.app.workspace.getLeaf(false).openFile(file);
                new Notice(`Проект "${name}" создан!`);
                this.refreshContent();
            }).open();
        };

        // Tabs Navigation
        this.renderTabs(container);

        const { incidents, tasks, projects } = await this.getDataFromVault();

        // Render content based on active tab
        if (this.activeTab === 'dashboard') {
            this.renderDashboard(container as HTMLElement, incidents, tasks, projects);
        } else if (this.activeTab === 'kanban') {
            this.renderKanban(container as HTMLElement, tasks, projects);
        } else if (this.activeTab === 'calendar') {
            this.renderCalendar(container as HTMLElement, tasks, projects);
        }

        } finally {
            this.isRefreshing = false;
        }
    }

    renderTabs(container: Element) {
        const tabsContainer = container.createDiv({ cls: 'monitoring-tabs-nav' });
        
        const tabs = [
            { id: 'dashboard', label: 'Дашборд', icon: 'layout-dashboard' },
            { id: 'kanban', label: 'Канбан', icon: 'columns' },
            { id: 'calendar', label: 'Календарь', icon: 'calendar' }
        ];

        tabs.forEach(tab => {
            const tabEl = tabsContainer.createDiv({ 
                cls: `monitoring-tab-item ${this.activeTab === tab.id ? 'is-active' : ''}`,
            });
            tabEl.createSpan({ text: tab.label });
            tabEl.onclick = () => {
                this.activeTab = tab.id as any;
                this.refreshContent();
            };
        });
    }

    async renderDashboard(container: Element, incidents: IncidentData[], tasks: TaskData[], projects: ProjectData[]) {
        this.renderHeroSection(container, incidents, tasks, projects);
        
        // Projects Section
        container.createEl('h3', { text: 'Проекты' });
        this.renderProjectsTable(container, projects);

        // Tasks Section
        const taskHeaderContainer = container.createDiv({ cls: 'section-header-with-btn' });
        taskHeaderContainer.createEl('h3', { text: 'Задачи' });
        
        const filterBtn = taskHeaderContainer.createEl('button', { 
            cls: 'monitoring-glass-btn filter-edit-btn',
            text: '⚙️ Редактировать фильтры'
        });
        filterBtn.onclick = () => {
            new FilterModal(this.app, projects, this.plugin.settings.savedFilters, async (newFilters) => {
                this.plugin.settings.savedFilters = newFilters;
                await this.plugin.saveSettings();
                this.currentFilterId = null; // Reset to "All" when filters change
                this.refreshContent();
            }).open();
        };

        this.renderFilterTabs(container); // Quick switch between saved filters
        this.renderTasksTable(container, tasks);

        // Active Mail Section
        container.createEl('h3', { text: 'Почта' });
        
        // Tracked Subjects Section (Moved here)
        await this.renderTrackedSubjects(container);
        
        this.renderIncidentsTable(container, incidents);
    }

    renderKanban(container: Element, tasks: TaskData[], projects: ProjectData[]) {
        const kanbanWrapper = container.createDiv({ cls: 'monitoring-kanban-wrapper' });
        
        const renderBoard = (title: string, items: any[], type: 'task' | 'project') => {
            container.createEl('h3', { text: title, attr: { style: 'margin-top: 20px;' } });
            const board = container.createDiv({ cls: 'monitoring-kanban-board' });
            
            const statuses = [
                { id: 'todo', label: 'Ожидание', color: 'orange', match: ['todo', 'pending', 'ожида', 'запланировано', 'to do'] },
                { id: 'active', label: 'В работе', color: 'blue', match: ['active', 'in progress', 'в работе', 'в процессе'] },
                { id: 'done', label: 'Завершено', color: 'green', match: ['done', 'completed', 'завершен', 'выполнено'] }
            ];

            statuses.forEach(status => {
                const column = board.createDiv({ cls: `kanban-column ${status.color}` });
                column.createEl('h4', { text: status.label });
                
                const cardsContainer = column.createDiv({ cls: 'kanban-cards' });
                
                // Drag Enter/Over/Drop
                column.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    column.addClass('is-drag-over');
                });
                column.addEventListener('dragleave', () => {
                    column.removeClass('is-drag-over');
                });
                column.addEventListener('drop', async (e) => {
                    e.preventDefault();
                    column.removeClass('is-drag-over');
                    try {
                        const rawData = e.dataTransfer?.getData('text/plain');
                        if (!rawData) return;
                        const data = JSON.parse(rawData);
                        if (data.path && data.type === type) {
                            await this.updateItemStatus(data.path, status.label);
                            // Important: wait for metadata cache to synchronize to avoid "double move" bug
                            await new Promise(r => setTimeout(r, 400));
                            this.refreshContent();
                        }
                    } catch (err) {
                        console.error("Drop error:", err);
                    }
                });

                const filtered = items.filter(item => {
                    const s = (item.status || "").toLowerCase().trim();
                    const labelLower = status.label.toLowerCase();
                    // Matching: by defined keywords, by exact label, or by status ID (normalized)
                    return status.match.some(m => s.includes(m)) || 
                           s === labelLower || 
                           s.replace(/\s+/g, '') === status.id;
                });

                if (filtered.length === 0) {
                    cardsContainer.createDiv({ text: 'Пусто', cls: 'kanban-empty' });
                }

                filtered.forEach(item => {
                    const card = cardsContainer.createDiv({ 
                        cls: `kanban-card ${type === 'task' ? 'task-card priority-' + item.priority : 'project-card'}` 
                    });
                    
                    // Specific coloring for projects if priority exists, or just project-card style
                    if (type === 'project' && item.priority) {
                        card.addClass(`priority-${item.priority}`);
                    }
                    card.setAttribute('draggable', 'true');
                    
                    card.createDiv({ cls: 'card-title', text: (type === 'project' ? item.name : item.name) });
                    if (type === 'task') {
                        card.createDiv({ cls: 'card-meta', text: `Приоритет: ${item.priority} | ${item.deadline || 'Без срока'}` });
                    } else {
                        card.createDiv({ cls: 'card-meta', text: item.goal || 'Цель не задана' });
                    }

                    card.addEventListener('dragstart', (e) => {
                        e.dataTransfer?.setData('text/plain', JSON.stringify({ path: item.path, type: type }));
                        card.addClass('is-dragging');
                    });
                    card.addEventListener('dragend', () => {
                        card.removeClass('is-dragging');
                    });

                    card.onclick = () => {
                        this.app.workspace.getLeaf(false).openFile(this.app.vault.getAbstractFileByPath(item.path) as TFile);
                    };
                });
            });
        };

        renderBoard("Доска Проектов", projects, 'project');
        renderBoard("Доска Задач", tasks, 'task');
    }

    async updateItemStatus(path: string, newStatus: string) {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                fm['status'] = newStatus;
            });
        }
    }

    renderCalendar(container: Element, tasks: TaskData[], projects: ProjectData[]) {
        const calendarWrapper = container.createDiv({ cls: 'monitoring-calendar-wrapper' });

        // Week Navigation Header
        const navHeader = calendarWrapper.createDiv({ cls: 'calendar-week-nav' });
        
        const prevBtn = navHeader.createEl('button', { text: '← Пред. неделя', cls: 'monitoring-refresh-btn' });
        prevBtn.onclick = () => { this.calendarWeekOffset--; this.refreshContent(); };

        const todayBtn = navHeader.createEl('button', { text: 'Сегодня', cls: 'monitoring-glass-btn' });
        todayBtn.onclick = () => { this.calendarWeekOffset = 0; this.refreshContent(); };

        const nextBtn = navHeader.createEl('button', { text: 'След. неделя →', cls: 'monitoring-refresh-btn' });
        nextBtn.onclick = () => { this.calendarWeekOffset++; this.refreshContent(); };
        
        // Linear Weekly Calendar
        const todayAt = new Date();
        const startOfWeek = new Date(todayAt);
        const dayOfWeek = todayAt.getDay();
        const diff = todayAt.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1) + (this.calendarWeekOffset * 7); 
        startOfWeek.setDate(diff);
        startOfWeek.setHours(0, 0, 0, 0);

        const currentWeekLabel = navHeader.createSpan({ 
            cls: 'week-label', 
            text: `Неделя: ${startOfWeek.toLocaleDateString()} - ${new Date(new Date(startOfWeek).setDate(startOfWeek.getDate()+6)).toLocaleDateString()}` 
        });

        const daysHeader = calendarWrapper.createDiv({ cls: 'calendar-linear-header' });
        const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        
        const datesInWeek: Date[] = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(startOfWeek);
            d.setDate(startOfWeek.getDate() + i);
            datesInWeek.push(d);
            
            const dayHead = daysHeader.createDiv({ cls: 'calendar-linear-day-head' });
            dayHead.createDiv({ cls: 'day-name', text: weekDays[i] });
            dayHead.createDiv({ cls: 'day-num', text: d.getDate().toString() });
            if (d.toDateString() === todayAt.toDateString()) dayHead.addClass('is-today');
        }

        const renderTimeline = (title: string, items: any[], type: 'task' | 'project') => {
            calendarWrapper.createEl('h3', { text: title, attr: { style: 'margin-top: 30px;' } });
            
            const timeline = calendarWrapper.createDiv({ cls: 'calendar-linear-timeline' });
            
            // Grid background
            const grid = timeline.createDiv({ cls: 'timeline-grid' });
            for (let i = 0; i < 7; i++) grid.createDiv({ cls: 'timeline-line' });

            const entriesContainer = timeline.createDiv({ cls: 'timeline-entries' });

            items.forEach(item => {
                let start: Date, end: Date;
                
                if (type === 'task') {
                    const deadlineStr = item.deadline || "";
                    if (deadlineStr.includes(' to ')) {
                        const parts = deadlineStr.split(' to ');
                        start = new Date(parts[0].trim());
                        end = new Date(parts[1].split(' ')[0].trim());
                    } else if (deadlineStr) {
                        start = new Date(deadlineStr.split(' ')[0].trim());
                        end = new Date(start);
                    } else {
                        return; // No date
                    }
                } else {
                    const startStr = item.started;
                    if (!startStr) return;
                    start = new Date(startStr);
                    const endStr = item.target_date || item.deadline;
                    end = endStr ? new Date(endStr.split(' ')[0].trim()) : new Date(start);
                }

                const weekEnd = new Date(datesInWeek[6]);
                weekEnd.setHours(23, 59, 59, 999);

                if (end < startOfWeek || start > weekEnd) return; // Out of week view

                const visibleStart = start < startOfWeek ? startOfWeek : start;
                const visibleEnd = end > weekEnd ? weekEnd : end;

                // Normalize dates to start of day for grid calculation
                const normStartAt = new Date(visibleStart); normStartAt.setHours(0,0,0,0);
                const normEndAt = new Date(visibleEnd); normEndAt.setHours(0,0,0,0);
                const normWeekStart = new Date(startOfWeek); normWeekStart.setHours(0,0,0,0);

                const startCol = Math.max(0, Math.floor((normStartAt.getTime() - normWeekStart.getTime()) / (1000 * 60 * 60 * 24)));
                const duration = Math.ceil((normEndAt.getTime() - normStartAt.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                const span = Math.min(7 - startCol, duration);

                const entry = entriesContainer.createDiv({ 
                    cls: `timeline-entry ${type}-entry ${this.getStatusClass(item.status)} ${type === 'task' ? 'priority-' + item.priority : ''}`,
                    attr: { 
                        style: `grid-column: ${startCol + 1} / span ${span}`,
                        title: type === 'project' 
                            ? `Проект: ${item.name}\nЦель: ${item.goal || 'не задана'}\nСтатус: ${item.status}\nПериод: ${start.toLocaleDateString()} - ${end.toLocaleDateString()}`
                            : `Задача: ${item.name}\nСрок: ${item.deadline || 'не указан'}\nПриоритет: ${item.priority}\nСтатус: ${item.status}`
                    }
                });
                
                const label = entry.createDiv({ cls: 'entry-label' });
                label.createSpan({ text: item.name });
                if (duration > 1) {
                    entry.createDiv({ cls: 'entry-period', text: `${duration}д` });
                }

                entry.onclick = () => {
                    this.app.workspace.getLeaf(false).openFile(this.app.vault.getAbstractFileByPath(item.path) as TFile);
                };
            });
        };

        renderTimeline("Проекты (эта неделя)", projects, 'project');
        renderTimeline("Задачи (эта неделя)", tasks, 'task');
    }

    async getDataFromVault(): Promise<{incidents: IncidentData[], tasks: TaskData[], projects: ProjectData[]}> {
        const incidents: IncidentData[] = [];
        const tasks: TaskData[] = [];
        const projects: ProjectData[] = [];
        
        const files = this.app.vault.getMarkdownFiles();
        const incidentsFolder = this.plugin.settings.incidentsFolder.toLowerCase();
        
        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            let rawTags: any = cache?.frontmatter?.tags || [];
            
            // Normalize tags to a clean string array
            let tags: string[] = [];
            if (typeof rawTags === 'string') {
                tags = rawTags.split(/[,;]/).map(t => t.trim());
            } else if (Array.isArray(rawTags)) {
                tags = rawTags.map(t => String(t).trim());
            }

            // Remove '#' prefix and make lowercase
            const cleanTags = tags
                .filter(t => t && t.length > 0)
                .map(t => t.startsWith('#') ? t.substring(1).toLowerCase() : t.toLowerCase());
            
            const fileBasename = file.basename;
            const filePathLower = file.path.toLowerCase();
            const linkedProject = cache?.frontmatter?.['linked_project'];

            // Identification logic: Tag OR Folder OR Property
            const isIncident = filePathLower.startsWith(incidentsFolder) || cleanTags.includes('incident');
            const isTask = cleanTags.includes('task') || filePathLower.startsWith('tasks/') || !!linkedProject;
            const isProject = cleanTags.includes('project') || filePathLower.startsWith('projects/');

            if (isIncident) {
                incidents.push({
                    id: fileBasename.replace(/^Incident-/, ''),
                    name: cache?.frontmatter?.['conversation_topic'] || fileBasename,
                    status: cache?.frontmatter?.['status'] || 'Unknown',
                    date: cache?.frontmatter?.['date'] || 'Unknown',
                    path: file.path,
                    sender: cache?.frontmatter?.['sender'] || 'Unknown'
                });
            } else if (isTask) {
                tasks.push({
                    id: fileBasename,
                    name: fileBasename.replace(/^Task-/, ''),
                    status: cache?.frontmatter?.['status'] || 'To Do',
                    deadline: cache?.frontmatter?.['deadline'] || '',
                    path: file.path,
                    priority: cache?.frontmatter?.['priority'] || 3,
                    tags: cleanTags,
                    linkedProject: linkedProject
                });
            } else if (isProject) {
                projects.push({
                    id: fileBasename,
                    name: fileBasename.replace(/^Project-/, ''),
                    status: cache?.frontmatter?.['status'] || 'Active',
                    path: file.path,
                    goal: cache?.frontmatter?.['goal'] || '',
                    priority: cache?.frontmatter?.['priority'],
                    // @ts-ignore
                    started: cache?.frontmatter?.['started'],
                    // @ts-ignore
                    target_date: cache?.frontmatter?.['target_date']
                });
            }
        }

        return {
            incidents: incidents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
            tasks: tasks.sort((a, b) => a.name.localeCompare(b.name)),
            projects: projects.sort((a, b) => a.name.localeCompare(b.name))
        };
    }

    renderHeroSection(container: Element, incidents: IncidentData[], tasks: TaskData[], projects: ProjectData[]) {
        const hero = container.createDiv({ cls: 'monitoring-hero-section' });
        
        // Time & Date Only (Greeting removed)
        const leftSide = hero.createDiv({ cls: 'hero-left' });
        const now = new Date();

        leftSide.createEl('h1', { 
            text: now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }), 
            cls: 'hero-title' 
        });
        leftSide.createEl('p', { 
            text: `Актуальные данные на ${now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`,
            cls: 'hero-subtitle'
        });

        // Metrics Grid (Integrated into Hero)
        const metrics = hero.createDiv({ cls: 'hero-metrics' });
        
        const activeTasks = tasks.filter(t => t.status.toLowerCase().includes('progress') || t.status.toLowerCase().includes('работа')).length;
        const pendingIncidents = incidents.filter(i => i.status.toLowerCase().includes('pending') || i.status.toLowerCase().includes('ожидает')).length;
        const completedThisWeek = tasks.filter(t => t.status.toLowerCase().includes('done') || t.status.toLowerCase().includes('завершен')).length;

        this.createMetricItem(metrics, activeTasks.toString(), 'Задач в работе', 'blue-glow');
        this.createMetricItem(metrics, pendingIncidents.toString(), 'Инцидентов', 'orange-glow');
        this.createMetricItem(metrics, completedThisWeek.toString(), 'Готово (нед)', 'green-glow');
    }

    createMetricItem(container: Element, value: string, label: string, glowClass: string) {
        const item = container.createDiv({ cls: `metric-item ${glowClass}` });
        item.createDiv({ cls: 'metric-value', text: value });
        item.createDiv({ cls: 'metric-label', text: label });
    }

    renderStats(container: Element, incidents: IncidentData[]) {
        // Keeping for generic usage if needed
    }

    createStatCard(container: Element, label: string, value: string, colorClass: string) {
        // Keeping for generic usage if needed
    }

    renderProjectsTable(container: Element, projects: ProjectData[]) {
        if (projects.length === 0) {
            container.createEl('p', { text: 'Проектов пока нет.', cls: 'empty-state-text' });
            return;
        }

        const table = container.createEl('table', { cls: 'monitoring-data-table' });
        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        headerRow.createEl('th', { text: 'Название' });
        headerRow.createEl('th', { text: 'Цель' });
        headerRow.createEl('th', { text: 'Статус' });

        const tbody = table.createEl('tbody');
        projects.forEach(p => {
            const row = tbody.createEl('tr');
            const nameCell = row.createEl('td');
            const link = nameCell.createEl('a', { text: p.name, cls: 'incident-link' });
            link.onclick = (e) => {
                e.preventDefault();
                this.app.workspace.getLeaf(false).openFile(this.app.vault.getAbstractFileByPath(p.path) as TFile);
            };

            row.createEl('td', { text: p.goal || '---' });
            const statusCell = row.createEl('td');
            statusCell.createSpan({ text: p.status, cls: `status-badge ${this.getStatusClass(p.status)}` });
        });
    }

    renderFilterTabs(container: Element) {
        const filters = this.plugin.settings.savedFilters;
        if (filters.length === 0) return;
        
        const tabsContainer = container.createDiv({ cls: 'filter-tabs-nav' });
        
        // "All" option
        const allTab = tabsContainer.createDiv({ 
            cls: `filter-tab-btn ${this.currentFilterId === null ? 'is-active' : ''}`,
            text: 'Все'
        });
        allTab.onclick = () => { this.currentFilterId = null; this.refreshContent(); };

        filters.forEach((f, idx) => {
            const tab = tabsContainer.createDiv({ 
                cls: `filter-tab-btn ${this.currentFilterId === idx ? 'is-active' : ''}`,
                text: f.name
            });
            tab.onclick = () => {
                this.currentFilterId = (this.currentFilterId === idx) ? null : idx;
                this.refreshContent();
            };
        });
    }

    renderTasksTable(container: Element, tasks: TaskData[]) {
        // Apply Filters
        let filteredTasks = tasks;
        if (this.currentFilterId !== null && this.plugin.settings.savedFilters[this.currentFilterId]) {
            const activeFilter = this.plugin.settings.savedFilters[this.currentFilterId];
            
            // Normalize filter tags
            const filterTags = activeFilter.tags.map(t => t.trim().replace(/^#/, '').toLowerCase());
            
            // Special check: is this a project filter? (Contains a tag starting with "project" or matching a project name)
            const projectTag = filterTags.find(t => t.startsWith('project'));
            const filterProjName = projectTag ? projectTag.replace(/^project/, '') : null;

            filteredTasks = tasks.filter(t => {
                // 1. Tag Match (Check all filter tags)
                const tagsMatch = filterTags.every(fTag => t.tags.includes(fTag));
                
                // 2. Project Property Match (If it's a project filter)
                let projectMatch = false;
                if (filterProjName && t.linkedProject) {
                    const cleanLinkProj = t.linkedProject.toLowerCase().replace(/\s+/g, '').replace(/[^\w\u0400-\u04FF]/g, '');
                    if (cleanLinkProj === filterProjName) projectMatch = true;
                }

                return tagsMatch || projectMatch;
            });
        }

        if (filteredTasks.length === 0) {
            container.createEl('p', { text: 'Нет задач, соответствующих фильтрам.', cls: 'empty-state-text' });
            return;
        }

        const table = container.createEl('table', { cls: 'monitoring-data-table' });
        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        headerRow.createEl('th', { text: 'Задача' });
        headerRow.createEl('th', { text: 'Срок' });
        headerRow.createEl('th', { text: 'Приоритет' });
        headerRow.createEl('th', { text: 'Статус' });

        const tbody = table.createEl('tbody');
        filteredTasks.slice(0, 50).forEach(t => {
            const row = tbody.createEl('tr');
            const nameCell = row.createEl('td');
            const link = nameCell.createEl('a', { text: t.name, cls: 'incident-link' });
            link.onclick = (e) => {
                e.preventDefault();
                this.app.workspace.getLeaf(false).openFile(this.app.vault.getAbstractFileByPath(t.path) as TFile);
            };

            row.createEl('td', { text: t.deadline || '---' });
            
            const pCell = row.createEl('td');
            pCell.createSpan({ text: t.priority.toString(), cls: `priority-badge priority-${t.priority}` });

            const statusCell = row.createEl('td');
            statusCell.createSpan({ text: t.status, cls: `status-badge ${this.getStatusClass(t.status)}` });
        });
    }

    async renderTrackedSubjects(container: Element) {
        const dashboardFn = this.plugin.settings.dashboardNoteName;
        const dashboardFile = this.app.vault.getAbstractFileByPath(dashboardFn) as TFile;
        
        let tracked: string[] = [];
        if (dashboardFile) {
            const cache = this.app.metadataCache.getFileCache(dashboardFile);
            if (cache?.frontmatter && Array.isArray(cache.frontmatter['tracked_subjects'])) {
                tracked = cache.frontmatter['tracked_subjects'];
            }
        }

        if (tracked.length === 0) {
            container.createEl('p', { text: 'Темы не отслеживаются. Добавьте их в Dashboard.md', cls: 'empty-state-text' });
            return;
        }

        const list = container.createDiv({ cls: 'tracked-subjects-list' });
        tracked.forEach(t => {
            const item = list.createSpan({ text: t, cls: 'tracked-subject-tag' });
        });
    }

    renderIncidentsTable(container: Element, incidents: IncidentData[]) {
        if (incidents.length === 0) {
            container.createEl('p', { text: 'Инцидентов пока нет.', cls: 'empty-state-text' });
            return;
        }

        const table = container.createEl('table', { cls: 'monitoring-data-table' });
        
        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        headerRow.createEl('th', { text: 'Дата' });
        headerRow.createEl('th', { text: 'Тема / Инцидент' });
        headerRow.createEl('th', { text: 'Отправитель' });
        headerRow.createEl('th', { text: 'Статус' });

        const tbody = table.createEl('tbody');
        incidents.slice(0, 15).forEach(i => {
            const row = tbody.createEl('tr');
            
            const dateStr = i.date !== 'Unknown' ? new Date(i.date).toLocaleDateString('ru-RU') : 'Unknown';
            row.createEl('td', { text: dateStr });
            
            const nameCell = row.createEl('td');
            const link = nameCell.createEl('a', { text: i.name, cls: 'incident-link' });
            link.onclick = (e) => {
                e.preventDefault();
                this.app.workspace.getLeaf(false).openFile(this.app.vault.getAbstractFileByPath(i.path) as TFile);
            };

            row.createEl('td', { text: i.sender });
            
            const statusCell = row.createEl('td');
            statusCell.createSpan({ text: i.status, cls: `status-badge ${this.getStatusClass(i.status)}` });
        });
    }

    getStatusClass(status: string) {
        status = status.toLowerCase();
        if (status.includes('завершен') || status.includes('выполнено') || status === 'done' || status === 'completed') return 'status-success';
        if (status.includes('в работе') || status.includes('в процессе') || status === 'active' || status === 'in progress') return 'status-active';
        if (status.includes('запланировано') || status.includes('ожидает') || status === 'pending') return 'status-pending';
        return 'status-default';
    }

    async generateWeeklyReport() {
        new Notice('Генерация отчета за неделю...');
        try {
            const { incidents } = await this.getDataFromVault();
            if (incidents.length === 0) {
                new Notice('Нет инцидентов для анализа.');
                return;
            }

            let combinedText = "";
            for (const inc of incidents.slice(0, 10)) { 
                const file = this.app.vault.getAbstractFileByPath(inc.path) as TFile;
                const content = await this.app.vault.read(file);
                const summaryMatch = content.match(/## Текущее саммари инцидента\n([\s\S]*?)\n---/);
                if (summaryMatch) {
                    combinedText += `--- Incident: ${inc.name} ---\n${summaryMatch[1]}\n\n`;
                }
            }

            if (!combinedText) {
                new Notice('Не удалось извлечь данные для отчета.');
                return;
            }

            const report = await this.plugin.llmService.generateWeeklyReport(combinedText);
            
            const dateStr = new Date().toISOString().split('T')[0];
            const fileName = `Weekly-Report-${dateStr}.md`;
            const fileContent = `# Еженедельный отчет от ${dateStr}\n\n${report}\n\n## Проанализированные инциденты\n${incidents.slice(0, 10).map(i => `- [[${i.path}|${i.name}]]`).join('\n')}`;
            
            const file = await this.app.vault.create(fileName, fileContent);
            await this.app.workspace.getLeaf(false).openFile(file);
            new Notice('Отчет успешно создан!');
        } catch (error) {
            console.error(error);
            new Notice('Ошибка при генерации отчета: ' + error.message);
        }
    }

    async onClose() {
        // Cleanup if needed
    }
}

class FilterModal extends Modal {
    projects: ProjectData[];
    savedFilters: { name: string, tags: string[] }[];
    onSave: (filters: { name: string, tags: string[] }[]) => void;
    
    // UI temporary state
    editingFilters: { name: string, tags: string[] }[];
    currentName: string = "";
    currentTags: string[] = [];
    newTag: string = "";

    constructor(app: any, projects: ProjectData[], savedFilters: { name: string, tags: string[] }[], onSave: (filters: { name: string, tags: string[] }[]) => void) {
        super(app);
        this.projects = projects;
        this.savedFilters = savedFilters;
        this.editingFilters = JSON.parse(JSON.stringify(savedFilters));
        this.onSave = onSave;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: 'Управление сохраненными фильтрами' });

        const listContainer = contentEl.createDiv({ cls: 'modal-filter-manager' });
        
        const renderList = () => {
            listContainer.empty();
            if (this.editingFilters.length === 0) {
                listContainer.createEl('p', { text: 'У вас пока нет сохраненных фильтров', cls: 'empty-state-text' });
            }
            this.editingFilters.forEach((f, idx) => {
                const item = listContainer.createDiv({ cls: 'modal-filter-mgmt-item' });
                const mainInfo = item.createDiv({ cls: 'mgmt-item-info' });
                mainInfo.createEl('b', { text: f.name });
                mainInfo.createEl('br');
                mainInfo.createSpan({ text: f.tags.map(t => `#${t}`).join(' '), cls: 'mgmt-item-tags' });
                
                const deleteBtn = item.createEl('button', { text: 'Удалить', cls: 'footer-btn delete-btn' });
                deleteBtn.onclick = () => {
                    this.editingFilters.splice(idx, 1);
                    renderList();
                };
            });
        };
        renderList();

        contentEl.createEl('hr');
        contentEl.createEl('h4', { text: 'Создать новый фильтр' });

        const form = contentEl.createDiv({ cls: 'filter-creation-form' });
        
        const nameInput = new TextComponent(form);
        nameInput.setPlaceholder("Название фильтра (например: Работа по Проекту А)");
        nameInput.inputEl.style.width = "100%";
        nameInput.inputEl.style.marginBottom = "10px";
        nameInput.onChange(v => this.currentName = v);

        // Tags area
        const tagsPreview = form.createDiv({ cls: 'active-filters-container', attr: { style: 'min-height: 20px; margin-bottom: 10px;' } });
        const renderTagsPreview = () => {
            tagsPreview.empty();
            this.currentTags.forEach(t => {
                const tagEl = tagsPreview.createSpan({ cls: 'filter-tag', text: `#${t}` });
                const x = tagEl.createSpan({ text: ' ×', cls: 'filter-tag-remove' });
                x.onclick = () => {
                    this.currentTags = this.currentTags.filter(tag => tag !== t);
                    renderTagsPreview();
                };
            });
        };

        const tagControls = form.createDiv({ attr: { style: 'display: flex; gap: 8px; margin-bottom: 10px;' } });
        const tagInput = new TextComponent(tagControls);
        tagInput.setPlaceholder("Добавить тег...");
        tagInput.onChange(v => this.newTag = v);
        
        const addTagBtn = new ButtonComponent(tagControls).setButtonText("Добавить").onClick(() => {
            if (this.newTag) {
                const t = this.newTag.trim().replace(/^#/, '');
                if (!this.currentTags.includes(t)) {
                    this.currentTags.push(t);
                    renderTagsPreview();
                }
                this.newTag = "";
                tagInput.setValue("");
            }
        });

        const projectSelect = form.createEl('select', { attr: { style: 'width: 100%; padding: 6px; margin-bottom: 15px;' } });
        projectSelect.createEl('option', { text: 'Или выберите проект для авто-тега...', value: '' });
        this.projects.forEach(p => projectSelect.createEl('option', { text: p.name, value: p.name }));
        projectSelect.onchange = () => {
            const val = projectSelect.value;
            if (val) {
                // Generate clean tag with "Project" prefix as requested by user
                const t = 'Project' + val.replace(/\s+/g, '').replace(/[^\w\u0400-\u04FF]/g, '');
                if (!this.currentTags.includes(t)) {
                    this.currentTags.push(t);
                    renderTagsPreview();
                }
                // Suggest filter name if empty
                if (!this.currentName) {
                    this.currentName = `Проект: ${val}`;
                    nameInput.setValue(this.currentName);
                }
                projectSelect.value = '';
            }
        };

        const createFinalBtn = new ButtonComponent(form)
            .setButtonText("Добавить фильтр в список")
            .onClick(() => {
                if (!this.currentName || this.currentTags.length === 0) {
                    new Notice("Укажите название и хотя бы один тег");
                    return;
                }
                this.editingFilters.unshift({ name: this.currentName, tags: [...this.currentTags] });
                // Reset form
                this.currentName = "";
                this.currentTags = [];
                nameInput.setValue("");
                renderTagsPreview();
                renderList();
            });
        createFinalBtn.buttonEl.style.width = "100%";

        const footer = contentEl.createDiv({ cls: 'modal-button-container', attr: { style: 'display: flex; justify-content: flex-end; gap: 10px; margin-top: 30px;' } });
        new ButtonComponent(footer).setButtonText("Сохранить все изменения").setCta().onClick(() => {
            // Если пользователь ввел данные, но не нажал "+", сохраняем их автоматически
            if (this.currentName && this.currentTags.length > 0) {
                const alreadyAdded = this.editingFilters.some(f => f.name === this.currentName);
                if (!alreadyAdded) {
                    this.editingFilters.unshift({ name: this.currentName, tags: [...this.currentTags] });
                }
            } else if (this.currentName || this.newTag) {
                // Notice if they filled something but no tags
                if (this.currentTags.length === 0 && !this.newTag) {
                   // Just save what we have
                } else if (this.newTag && !this.currentTags.includes(this.newTag)) {
                    const t = this.newTag.trim().replace(/^#/, '');
                    this.currentTags.push(t);
                    this.editingFilters.unshift({ name: this.currentName, tags: [...this.currentTags] });
                }
            }
            this.onSave(this.editingFilters);
            this.close();
        });
        new ButtonComponent(footer).setButtonText("Отмена").onClick(() => this.close());
    }
}

class NamingModal extends Modal {
    name: string;
    onSubmit: (name: string) => void;
    title: string;

    constructor(app: any, title: string, onSubmit: (name: string) => void) {
        super(app);
        this.title = title;
        this.onSubmit = onSubmit;
    }

    submit() {
        if (this.name) {
            this.onSubmit(this.name);
            this.close();
        } else {
            new Notice("Пожалуйста, введите название");
        }
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: this.title });

        const input = new TextComponent(contentEl);
        input.setPlaceholder("Введите название...");
        input.onChange(value => this.name = value);
        input.inputEl.style.width = "100%";
        input.inputEl.style.marginBottom = "20px";
        input.inputEl.focus(); // Focus input automatically

        const btnContainer = contentEl.createDiv({ cls: 'modal-button-container' });
        
        new ButtonComponent(btnContainer)
            .setButtonText("Создать")
            .setCta()
            .onClick(() => this.submit());

        input.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.submit();
            }
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
