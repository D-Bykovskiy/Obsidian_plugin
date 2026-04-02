import { ItemView, WorkspaceLeaf, TFile, Notice, Modal, TextComponent, ButtonComponent } from 'obsidian';
import MonitoringPlugin from '../main';
import { DataService } from './DataService';
import { DashboardView } from './DashboardView';
import { KanbanView } from './KanbanView';
import { CalendarView } from './CalendarView';
import { NotesView } from './NotesView';

export const MAIN_PAGE_VIEW_TYPE = 'monitoring-main-page-view';

export class MainPageView extends ItemView {
    plugin: MonitoringPlugin;
    dataService: DataService;
    activeTab: 'dashboard' | 'kanban' | 'calendar' | 'notes' = 'dashboard';
    calendarWeekOffset: number = 0;
    currentFilterId: number | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: MonitoringPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.dataService = new DataService(
            this.app, 
            this.plugin.settings.incidentsFolder,
            this.plugin.settings.simpleNotesFolder
        );
    }

    getViewType() {
        return MAIN_PAGE_VIEW_TYPE;
    }

    getDisplayText() {
        return 'Панель управления';
    }

    getIcon() {
        return 'brain';
    }

    private isRefreshing = false;

    async onOpen() {
        await this.refreshContent();
    }

    async refreshContent() {
        if (this.isRefreshing) return;
        if (!this.containerEl.parentElement) return;

        this.isRefreshing = true;
        try {
            const container = this.containerEl.children[1];
            container.empty();
            container.addClass('monitoring-main-page');

            this.renderHeader(container);
            this.renderTabs(container);

            const data = await this.dataService.fetchVaultData();

            if (this.activeTab === 'dashboard') {
                const dashboardView = new DashboardView(
                    this.app,
                    this.dataService,
                    data.incidents,
                    data.tasks,
                    data.projects,
                    this.plugin.settings.savedFilters || [],
                    this.currentFilterId,
                    this.plugin.settings.dashboardNoteName
                );
                dashboardView.render(container);
            } else if (this.activeTab === 'kanban') {
                const kanbanView = new KanbanView(
                    this.app,
                    this.dataService,
                    this.plugin.templateManager,
                    data.tasks,
                    data.projects,
                    () => this.refreshContent()
                );
                kanbanView.render(container);
            } else if (this.activeTab === 'calendar') {
                const calendarView = new CalendarView(
                    this.app,
                    data.tasks,
                    data.projects,
                    this.calendarWeekOffset,
                    () => this.refreshContent()
                );
                calendarView.render(container);
            } else if (this.activeTab === 'notes') {
                const notesView = new NotesView(this.app, data.notes);
                notesView.render(container);
            }

        } finally {
            this.isRefreshing = false;
        }
    }

    private renderHeader(container: Element): void {
        const headerContainer = container.createDiv({ cls: 'main-page-header-container' });
        headerContainer.createEl('h2', { text: 'Панель управления v1.3.0', cls: 'main-page-header' });
        
        const btnGroup = headerContainer.createDiv({ cls: 'monitoring-header-btns' });
        
        btnGroup.createEl('button', { 
            cls: 'monitoring-refresh-btn',
            text: 'Обновить данные'
        }).onclick = () => this.refreshContent();

        btnGroup.createEl('button', {
            cls: 'monitoring-report-btn',
            text: 'Сформировать отчет'
        }).onclick = () => this.generateWeeklyReport();

        btnGroup.createEl('button', {
            cls: 'monitoring-glass-btn monitoring-add-task',
            text: '+ Задачу'
        }).onclick = () => this.showNamingModal('Создать новую задачу', async (name) => {
            const file = await this.plugin.templateManager.createTaskNote(name);
            await this.app.workspace.getLeaf(false).openFile(file);
            new Notice('Задача "' + name + '" создана!');
            this.refreshContent();
        });

        btnGroup.createEl('button', {
            cls: 'monitoring-glass-btn monitoring-add-project',
            text: '+ Проект'
        }).onclick = () => this.showNamingModal('Создать новый проект', async (name) => {
            const file = await this.plugin.templateManager.createProjectNote(name);
            await this.app.workspace.getLeaf(false).openFile(file);
            new Notice('Проект "' + name + '" создан!');
            this.refreshContent();
        });

        btnGroup.createEl('button', {
            cls: 'monitoring-glass-btn monitoring-add-note',
            text: '+ Заметку'
        }).onclick = () => this.showNamingModal('Создать новую заметку', async (name) => {
            const file = await this.plugin.templateManager.createSimpleNote(name);
            await this.app.workspace.getLeaf(false).openFile(file);
            new Notice('Заметка "' + name + '" создана!');
            this.refreshContent();
        });

        btnGroup.createEl('button', {
            cls: 'monitoring-glass-btn monitoring-daily-btn',
            text: '📅 Daily'
        }).onclick = async () => {
            try {
                const file = await this.plugin.dailyService.createDailyNote();
                await this.app.workspace.getLeaf(false).openFile(file);
                new Notice('Ежедневная заметка открыта!');
            } catch (e) {
                new Notice('Ошибка: ' + e.message);
            }
        };
    }

    private renderTabs(container: Element): void {
        const tabsContainer = container.createDiv({ cls: 'monitoring-tabs-nav' });
        
        const tabs = [
            { id: 'dashboard', label: 'Дашборд' },
            { id: 'kanban', label: 'Канбан' },
            { id: 'calendar', label: 'Календарь' },
            { id: 'notes', label: 'Заметки' }
        ];

        tabs.forEach(tab => {
            const tabEl = tabsContainer.createDiv({ 
                cls: 'monitoring-tab-item ' + (this.activeTab === tab.id ? 'is-active' : '')
            });
            tabEl.createSpan({ text: tab.label });
            tabEl.onclick = () => {
                this.activeTab = tab.id as any;
                this.refreshContent();
            };
        });
    }

    private showNamingModal(title: string, onSubmit: (name: string) => void): void {
        new NamingModal(this.app, title, onSubmit).open();
    }

    async generateWeeklyReport() {
        new Notice('Генерация отчета за неделю...');
        try {
            const data = await this.dataService.fetchVaultData();
            if (data.incidents.length === 0) {
                new Notice('Нет инцидентов для анализа.');
                return;
            }

            let combinedText = "";
            for (const inc of data.incidents.slice(0, 10)) { 
                const file = this.app.vault.getAbstractFileByPath(inc.path) as TFile;
                const content = await this.app.vault.read(file);
                const summaryMatch = content.match(/## Текущее саммари инцидента\n([\s\S]*?)\n---/);
                if (summaryMatch) {
                    combinedText += '--- Incident: ' + inc.name + ' ---\n' + summaryMatch[1] + '\n\n';
                }
            }

            if (!combinedText) {
                new Notice('Не удалось извлечь данные для отчета.');
                return;
            }

            const report = await this.plugin.llmService.generateWeeklyReport(combinedText);
            
            const dateStr = new Date().toISOString().split('T')[0];
            const fileName = 'Weekly-Report-' + dateStr + '.md';
            const fileContent = '# Еженедельный отчет от ' + dateStr + '\n\n' + report + '\n\n## Проанализированные инциденты\n' + 
                data.incidents.slice(0, 10).map(i => '- [[' + i.path + '|' + i.name + ']]').join('\n');
            
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
    name: string = "";
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
        
        requestAnimationFrame(() => {
            input.inputEl.focus();
        });

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
