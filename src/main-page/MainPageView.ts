import { ItemView, WorkspaceLeaf, TFile, Notice, Modal, TextComponent, ButtonComponent } from 'obsidian';
import MonitoringPlugin from '../main';
import { DataService } from './DataService';
import { DashboardView } from './DashboardView';
import { KanbanView } from './KanbanView';
import { CalendarView } from './CalendarView';
import { NotesView } from './NotesView';
import { ResourcesView } from './ResourcesView';
import { TeamService } from '../team/TeamService';

export const MAIN_PAGE_VIEW_TYPE = 'monitoring-main-page-view';

export class MainPageView extends ItemView {
    plugin: MonitoringPlugin;
    dataService: DataService;
    teamService: TeamService;
    resourcesView: ResourcesView;
    activeTab: 'dashboard' | 'kanban' | 'calendar' | 'notes' | 'resources' = 'dashboard';
    calendarWeekOffset: number = 0;
    currentFilterId: number | null = null;
    selectedResponsible: string | null = null;
    teamMembers: string[] = [];

    constructor(leaf: WorkspaceLeaf, plugin: MonitoringPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.dataService = new DataService(
            this.app, 
            this.plugin.settings.incidentsFolder,
            this.plugin.settings.simpleNotesFolder
        );
        this.teamService = new TeamService(this.app);
        this.resourcesView = new ResourcesView(this.app);
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
            this.teamMembers = await this.teamService.getTeamMembers();

            const container = this.containerEl.children[1];
            container.empty();
            container.addClass('monitoring-main-page');

            this.renderHeader(container);
            this.renderFilterBar(container);
            this.renderTabs(container);

            let data = await this.dataService.fetchVaultData();

            if (this.selectedResponsible) {
                data = {
                    ...data,
                    tasks: data.tasks.filter(t => t.responsible === this.selectedResponsible),
                    projects: data.projects.filter(p => p.responsible === this.selectedResponsible)
                };
            }

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
                    () => this.refreshContent(),
                    this.teamMembers,
                    this.plugin.settings.currentUser
                );
                kanbanView.render(container);
            } else if (this.activeTab === 'calendar') {
                const calendarView = new CalendarView(
                    this.app,
                    data.tasks,
                    data.projects,
                    this.calendarWeekOffset,
                    () => this.refreshContent(),
                    (offset: number) => { this.calendarWeekOffset = offset; }
                );
                calendarView.render(container);
            } else if (this.activeTab === 'notes') {
                const notesView = new NotesView(this.app, data.notes);
                notesView.render(container);
            } else if (this.activeTab === 'resources') {
                this.resourcesView.render(container);
            }

        } finally {
            this.isRefreshing = false;
        }
    }

    private renderHeader(container: Element): void {
        if (container.querySelector('.main-page-header-container')) return;
        
        const headerContainer = container.createDiv({ cls: 'main-page-header-container' });
        const version = this.plugin.manifest?.version || 'latest';
        headerContainer.createEl('h2', { text: 'Панель управления v' + version, cls: 'main-page-header' });
        
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

    private renderFilterBar(container: Element): void {
        const filterContainer = container.createDiv({ cls: 'monitoring-filter-bar' });
        
        const label = filterContainer.createSpan({ text: 'Ответственный: ' });
        label.style.marginRight = '10px';
        
        const select = filterContainer.createEl('select', { cls: 'monitoring-filter-select' });
        select.style.padding = '6px 12px';
        select.style.borderRadius = '6px';
        select.style.backgroundColor = 'var(--background-primary)';
        select.style.border = '1px solid var(--border-color)';
        select.style.color = 'var(--text-normal)';
        
        const defaultOption = select.createEl('option');
        defaultOption.text = 'Все';
        defaultOption.value = '';
        defaultOption.selected = !this.selectedResponsible;
        
        const currentUser = this.plugin.settings.currentUser;
        const allMembers = [...this.teamMembers];
        if (currentUser && !allMembers.includes(currentUser)) {
            allMembers.push(currentUser);
        }
        
        allMembers.forEach(member => {
            const option = select.createEl('option');
            option.text = member;
            option.value = member;
            if (this.selectedResponsible === member) {
                option.selected = true;
            }
        });

        if (currentUser) {
            const myTasksOption = select.createEl('option');
            myTasksOption.text = 'Мои задачи';
            myTasksOption.value = '__my__';
            if (this.selectedResponsible === currentUser) {
                myTasksOption.selected = true;
            }
        }

        select.onchange = () => {
            const value = select.value;
            if (value === '__my__') {
                this.selectedResponsible = this.plugin.settings.currentUser || null;
            } else if (value === '') {
                this.selectedResponsible = null;
            } else {
                this.selectedResponsible = value;
            }
            this.refreshContent();
        };
    }

    private renderTabs(container: Element): void {
        const tabsContainer = container.createDiv({ cls: 'monitoring-tabs-nav' });
        
        const tabs = [
            { id: 'dashboard', label: 'Дашборд' },
            { id: 'kanban', label: 'Канбан' },
            { id: 'calendar', label: 'Календарь' },
            { id: 'notes', label: 'Заметки' },
            { id: 'resources', label: 'Ресурсы' }
        ];

        tabs.forEach(tab => {
            const tabEl = tabsContainer.createDiv({ 
                cls: 'monitoring-tab-item ' + (this.activeTab === tab.id ? 'is-active' : '')
            });
            tabEl.createSpan({ text: tab.label });
            tabEl.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
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
        input.inputEl.classList.add('modal-input');
        input.inputEl.style.width = "100%";
        input.inputEl.style.marginBottom = "20px";
        
        requestAnimationFrame(() => {
            input.inputEl.focus();
        });
        setTimeout(() => {
            input.inputEl.focus();
        }, 100);

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
