import { ItemView, WorkspaceLeaf, TFile, Notice, Modal, TextComponent, ButtonComponent } from 'obsidian';
import MonitoringPlugin from '../main';

export const MAIN_PAGE_VIEW_TYPE = 'monitoring-main-page-view';

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

    async onOpen() {
        await this.refreshContent();
    }

    async refreshContent() {
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

        const incidents = await this.getIncidentsFromVault();

        // Render content based on active tab
        if (this.activeTab === 'dashboard') {
            this.renderDashboard(container, incidents);
        } else if (this.activeTab === 'kanban') {
            this.renderKanban(container, incidents);
        } else if (this.activeTab === 'calendar') {
            this.renderCalendar(container, incidents);
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

    async renderDashboard(container: Element, incidents: IncidentData[]) {
        // Stats Summary
        this.renderStats(container, incidents);

        // Tracked Subjects Section
        container.createEl('h3', { text: 'Отслеживаемые темы' });
        await this.renderTrackedSubjects(container);

        container.createEl('hr');

        // Active Incidents Section
        container.createEl('h3', { text: 'Последние инциденты (из почты)' });
        this.renderIncidentsTable(container, incidents);
    }

    renderKanban(container: Element, incidents: IncidentData[]) {
        const kanbanContainer = container.createDiv({ cls: 'monitoring-kanban-board' });
        
        const statuses = [
            { id: 'pending', label: 'Ожидают', color: 'orange' },
            { id: 'active', label: 'В работе', color: 'blue' },
            { id: 'done', label: 'Завершено', color: 'green' }
        ];

        statuses.forEach(status => {
            const column = kanbanContainer.createDiv({ cls: `kanban-column ${status.color}` });
            column.createEl('h4', { text: status.label });
            
            const cardsContainer = column.createDiv({ cls: 'kanban-cards' });
            
            const filtered = incidents.filter(i => {
                const s = i.status.toLowerCase();
                if (status.id === 'pending') return s.includes('pending') || s.includes('ожидает');
                if (status.id === 'active') return s.includes('active') || s.includes('в работе') || s.includes('в процессе');
                if (status.id === 'done') return s.includes('done') || s.includes('завершен') || s.includes('выполнено');
                return false;
            });

            if (filtered.length === 0) {
                cardsContainer.createDiv({ text: 'Пусто', cls: 'kanban-empty' });
            }

            filtered.forEach(inc => {
                const card = cardsContainer.createDiv({ cls: 'kanban-card' });
                card.createDiv({ cls: 'card-title', text: inc.name });
                card.createDiv({ cls: 'card-meta', text: `${new Date(inc.date).toLocaleDateString()} | ${inc.sender}` });
                card.onclick = () => {
                    this.app.workspace.getLeaf(false).openFile(this.app.vault.getAbstractFileByPath(inc.path) as TFile);
                };
            });
        });
    }

    renderCalendar(container: Element, incidents: IncidentData[]) {
        const calendarWrapper = container.createDiv({ cls: 'monitoring-calendar-wrapper' });
        
        // Simple 7-day view or full month? Let's do a simple list grouped by date for now, 
        // but styled like a timeline/calendar.
        
        const dateGroups: Record<string, IncidentData[]> = {};
        incidents.forEach(inc => {
            const dateKey = new Date(inc.date).toISOString().split('T')[0];
            if (!dateGroups[dateKey]) dateGroups[dateKey] = [];
            dateGroups[dateKey].push(inc);
        });

        const sortedDates = Object.keys(dateGroups).sort((a, b) => b.localeCompare(a));
        
        sortedDates.forEach(date => {
            const group = calendarWrapper.createDiv({ cls: 'calendar-day-group' });
            group.createEl('h4', { text: new Date(date).toLocaleDateString('ru-RU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) });
            
            const items = group.createDiv({ cls: 'calendar-items' });
            dateGroups[date].forEach(inc => {
                const item = items.createDiv({ cls: 'calendar-event-item' });
                const timeStr = new Date(inc.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                item.createSpan({ cls: 'event-time', text: timeStr });
                const link = item.createEl('a', { cls: 'event-link', text: inc.name });
                link.onclick = () => {
                    this.app.workspace.getLeaf(false).openFile(this.app.vault.getAbstractFileByPath(inc.path) as TFile);
                };
                item.createSpan({ cls: `status-dot ${this.getStatusClass(inc.status)}` });
            });
        });
    }

    async getIncidentsFromVault(): Promise<IncidentData[]> {
        const incidents: IncidentData[] = [];
        const files = this.app.vault.getMarkdownFiles();
        
        const incidentsFolder = this.plugin.settings.incidentsFolder.toLowerCase();
        
        for (const file of files) {
            if (file.path.toLowerCase().startsWith(incidentsFolder)) {
                const cache = this.app.metadataCache.getFileCache(file);
                if (cache?.frontmatter) {
                    incidents.push({
                        id: file.basename.replace('Incident-', ''),
                        name: cache.frontmatter['conversation_topic'] || file.basename,
                        status: cache.frontmatter['status'] || 'Unknown',
                        date: cache.frontmatter['date'] || 'Unknown',
                        path: file.path,
                        sender: cache.frontmatter['sender'] || 'Unknown'
                    });
                }
            }
        }

        return incidents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    renderStats(container: Element, incidents: IncidentData[]) {
        const statsContainer = container.createDiv({ cls: 'monitoring-stats-grid' });
        
        const total = incidents.length;
        const pending = incidents.filter(i => {
           const s = i.status.toLowerCase();
           return s.includes('pending') || s.includes('ожидает');
        }).length;
        const inProgress = incidents.filter(i => {
            const s = i.status.toLowerCase();
            return s.includes('active') || s.includes('в работе') || s.includes('в процессе');
        }).length;
        
        this.createStatCard(statsContainer, 'Всего инцидентов', total.toString(), 'blue');
        this.createStatCard(statsContainer, 'Ожидают', pending.toString(), 'orange');
        this.createStatCard(statsContainer, 'В работе', inProgress.toString(), 'green');
    }

    createStatCard(container: Element, label: string, value: string, colorClass: string) {
        const card = container.createDiv({ cls: `monitoring-stat-card ${colorClass}` });
        card.createDiv({ cls: 'stat-value', text: value });
        card.createDiv({ cls: 'stat-label', text: label });
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
            const incidents = await this.getIncidentsFromVault();
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
