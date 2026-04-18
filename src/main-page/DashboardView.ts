import { Notice, Modal, TextComponent, ButtonComponent } from 'obsidian';
import { BaseView } from './BaseView';
import { IncidentData, TaskData, ProjectData, FilterData } from './types';
import { DataService } from './DataService';

export class DashboardView extends BaseView {
    private dataService: DataService;
    private incidents: IncidentData[];
    private tasks: TaskData[];
    private projects: ProjectData[];
    private savedFilters: FilterData[];
    private currentFilterId: number | null;
    private dashboardFn: string;

    constructor(
        app: any,
        dataService: DataService,
        incidents: IncidentData[],
        tasks: TaskData[],
        projects: ProjectData[],
        savedFilters: FilterData[],
        currentFilterId: number | null,
        dashboardFn: string
    ) {
        super(app);
        this.dataService = dataService;
        this.incidents = incidents;
        this.tasks = tasks;
        this.projects = projects;
        this.savedFilters = savedFilters;
        this.currentFilterId = currentFilterId;
        this.dashboardFn = dashboardFn;
    }

    render(container: Element): void {
        this.renderHeroSection(container);
        this.renderProjectsSection(container);
        this.renderTasksSection(container);
        this.renderMailSection(container);
    }

    private renderHeroSection(container: Element): void {
        const hero = container.createDiv({ cls: 'monitoring-hero-section' });
        
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

        const metrics = hero.createDiv({ cls: 'hero-metrics' });
        
        const activeTasks = this.tasks.filter(t => 
            t.status.toLowerCase().includes('progress') || t.status.toLowerCase().includes('работа')
        ).length;
        const pendingIncidents = this.incidents.filter(i => 
            i.status.toLowerCase().includes('pending') || i.status.toLowerCase().includes('ожидает')
        ).length;
        const completedThisWeek = this.tasks.filter(t => 
            t.status.toLowerCase().includes('done') || t.status.toLowerCase().includes('завершен')
        ).length;

        this.createMetricItem(metrics, activeTasks.toString(), 'Задач в работе', 'blue-glow');
        this.createMetricItem(metrics, pendingIncidents.toString(), 'Инцидентов', 'orange-glow');
        this.createMetricItem(metrics, completedThisWeek.toString(), 'Готово (нед)', 'green-glow');
    }

    private createMetricItem(container: Element, value: string, label: string, glowClass: string): void {
        const item = container.createDiv({ cls: `metric-item ${glowClass}` });
        item.createDiv({ cls: 'metric-value', text: value });
        item.createDiv({ cls: 'metric-label', text: label });
    }

    private renderProjectsSection(container: Element): void {
        container.createEl('h3', { text: 'Проекты' });
        
        if (this.projects.length === 0) {
            this.createEmptyState(container, 'Проектов пока нет.');
            return;
        }

        const { tbody } = this.createTable(container, ['Название', 'Цель', 'Почта', 'Статус']);
        
        this.projects.forEach(p => {
            const row = tbody.createEl('tr');
            const nameCell = row.createEl('td');
            this.createLinkCell(nameCell, p.name, p.path);
            row.createEl('td', { text: p.goal || '---' });
            
            const emailCell = row.createEl('td');
            const emails = p.tracked_emails || [];
            if (emails.length > 0) {
                emailCell.createSpan({ text: `📧 ${emails.length}`, cls: 'email-count-badge' });
            } else {
                emailCell.createSpan({ text: '---', cls: 'empty-text' });
            }
            
            this.createStatusBadge(row.createEl('td'), p.status);
        });
    }

    private renderTasksSection(container: Element): void {
        const taskHeaderContainer = container.createDiv({ cls: 'section-header-with-btn' });
        taskHeaderContainer.createEl('h3', { text: 'Задачи' });
        
        const filterBtn = taskHeaderContainer.createEl('button', { 
            cls: 'monitoring-glass-btn filter-edit-btn',
            text: '⚙️ Редактировать фильтры'
        });
        filterBtn.onclick = () => this.openFilterModal();

        this.renderFilterTabs(container);
        this.renderTasksTable(container);
    }

    private renderFilterTabs(container: Element): void {
        if (this.savedFilters.length === 0) return;
        
        const tabsContainer = container.createDiv({ cls: 'filter-tabs-nav' });
        
        const allTab = tabsContainer.createDiv({ 
            cls: `filter-tab-btn ${this.currentFilterId === null ? 'is-active' : ''}`,
            text: 'Все'
        });
        allTab.onclick = () => { this.currentFilterId = null; /* Trigger parent refresh */ };

        this.savedFilters.forEach((f, idx) => {
            const tab = tabsContainer.createDiv({ 
                cls: `filter-tab-btn ${this.currentFilterId === idx ? 'is-active' : ''}`,
                text: f.name
            });
            tab.onclick = () => {
                this.currentFilterId = (this.currentFilterId === idx) ? null : idx;
            };
        });
    }

    private renderTasksTable(container: Element): void {
        let filteredTasks = this.tasks;
        
        if (this.currentFilterId !== null && this.savedFilters[this.currentFilterId]) {
            const activeFilter = this.savedFilters[this.currentFilterId];
            const filterTags = activeFilter.tags.map(t => t.trim().replace(/^#/, '').toLowerCase());
            const projectTag = filterTags.find(t => t.startsWith('project'));
            const filterProjName = projectTag ? projectTag.replace(/^project/, '') : null;

            filteredTasks = this.tasks.filter(t => {
                const tagsMatch = filterTags.every(fTag => t.tags.includes(fTag));
                
                let projectMatch = false;
                if (filterProjName && t.linkedProject) {
                    const cleanLinkProj = t.linkedProject.toLowerCase().replace(/\s+/g, '').replace(/[^\w\u0400-\u04FF]/g, '');
                    if (cleanLinkProj === filterProjName) projectMatch = true;
                }

                return tagsMatch || projectMatch;
            });
        }

        if (filteredTasks.length === 0) {
            this.createEmptyState(container, 'Нет задач, соответствующих фильтрам.');
            return;
        }

        const { tbody } = this.createTable(container, ['Задача', 'Срок', 'Приоритет', 'Статус']);
        
        filteredTasks.slice(0, 50).forEach(t => {
            const row = tbody.createEl('tr');
            const nameCell = row.createEl('td');
            this.createLinkCell(nameCell, t.name, t.path);
            row.createEl('td', { text: t.deadline || '---' });
            
            const pCell = row.createEl('td');
            pCell.createSpan({ text: t.priority.toString(), cls: `priority-badge priority-${t.priority}` });

            this.createStatusBadge(row.createEl('td'), t.status);
        });
    }

    private renderMailSection(container: Element): void {
        container.createEl('h3', { text: 'Почта' });
        this.renderTrackedSubjects(container);
        this.renderIncidentsTable(container);
    }

    private async renderTrackedSubjects(container: Element): Promise<void> {
        const tracked = await this.dataService.getTrackedSubjects(this.dashboardFn);

        if (tracked.length === 0) {
            this.createEmptyState(container, 'Темы не отслеживаются. Добавьте их в Dashboard.md');
            return;
        }

        const list = container.createDiv({ cls: 'tracked-subjects-list' });
        tracked.forEach(t => {
            list.createSpan({ text: t, cls: 'tracked-subject-tag' });
        });
    }

    private renderIncidentsTable(container: Element): void {
        if (this.incidents.length === 0) {
            this.createEmptyState(container, 'Инцидентов пока нет.');
            return;
        }

        const { tbody } = this.createTable(container, ['Дата', 'Тема / Инцидент', 'Отправитель', 'Статус']);
        
        this.incidents.slice(0, 15).forEach(i => {
            const row = tbody.createEl('tr');
            
            const dateStr = i.date !== 'Unknown' ? new Date(i.date).toLocaleDateString('ru-RU') : 'Unknown';
            row.createEl('td', { text: dateStr });
            
            const nameCell = row.createEl('td');
            this.createLinkCell(nameCell, i.name, i.path);
            row.createEl('td', { text: i.sender });
            this.createStatusBadge(row.createEl('td'), i.status);
        });
    }

    private openFilterModal(): void {
        new FilterModal(this.app, this.projects, this.savedFilters, () => {
            // Callback will be handled by parent
        }).open();
    }
}

class FilterModal extends Modal {
    projects: ProjectData[];
    savedFilters: FilterData[];
    editingFilters: FilterData[];
    currentName: string = "";
    currentTags: string[] = [];
    newTag: string = "";

    constructor(app: any, projects: ProjectData[], savedFilters: FilterData[], onSave: (filters: FilterData[]) => void) {
        super(app);
        this.projects = projects;
        this.savedFilters = savedFilters;
        this.editingFilters = JSON.parse(JSON.stringify(savedFilters));
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: 'Управление сохраненными фильтрами' });

        const listContainer = contentEl.createDiv({ cls: 'modal-filter-manager' });
        this.renderList(listContainer);

        contentEl.createEl('hr');
        contentEl.createEl('h4', { text: 'Создать новый фильтр' });

        const form = contentEl.createDiv({ cls: 'filter-creation-form' });
        
        const nameInput = new TextComponent(form);
        nameInput.setPlaceholder("Название фильтра");
        nameInput.inputEl.style.width = "100%";
        nameInput.inputEl.style.marginBottom = "10px";
        nameInput.onChange(v => this.currentName = v);

        nameInput.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (!this.currentName || this.currentTags.length === 0) {
                    new Notice("Укажите название и хотя бы один тег");
                    return;
                }
                this.editingFilters.unshift({ name: this.currentName, tags: [...this.currentTags] });
                this.currentName = "";
                this.currentTags = [];
                nameInput.setValue("");
                this.renderTagsPreview(tagsPreview);
                this.renderList(listContainer);
            }
        });

        const tagsPreview = form.createDiv({ cls: 'active-filters-container', attr: { style: 'min-height: 20px; margin-bottom: 10px;' } });
        this.renderTagsPreview(tagsPreview);

        const tagControls = form.createDiv({ attr: { style: 'display: flex; gap: 8px; margin-bottom: 10px;' } });
        const tagInput = new TextComponent(tagControls);
        tagInput.setPlaceholder("Добавить тег...");
        tagInput.onChange(v => this.newTag = v);
        
        tagInput.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (this.newTag) {
                    const t = this.newTag.trim().replace(/^#/, '');
                    if (!this.currentTags.includes(t)) {
                        this.currentTags.push(t);
                        this.renderTagsPreview(tagsPreview);
                    }
                    this.newTag = "";
                    tagInput.setValue("");
                }
            }
        });
        
        new ButtonComponent(tagControls).setButtonText("Добавить").onClick(() => {
            if (this.newTag) {
                const t = this.newTag.trim().replace(/^#/, '');
                if (!this.currentTags.includes(t)) {
                    this.currentTags.push(t);
                    this.renderTagsPreview(tagsPreview);
                }
                this.newTag = "";
                tagInput.setValue("");
            }
        });

        new ButtonComponent(form)
            .setButtonText("Добавить фильтр в список")
            .onClick(() => {
                if (!this.currentName || this.currentTags.length === 0) {
                    new Notice("Укажите название и хотя бы один тег");
                    return;
                }
                this.editingFilters.unshift({ name: this.currentName, tags: [...this.currentTags] });
                this.currentName = "";
                this.currentTags = [];
                nameInput.setValue("");
                this.renderTagsPreview(tagsPreview);
                this.renderList(listContainer);
            }).buttonEl.style.width = "100%";

        const footer = contentEl.createDiv({ cls: 'modal-button-container', attr: { style: 'display: flex; justify-content: flex-end; gap: 10px; margin-top: 30px;' } });
        new ButtonComponent(footer).setButtonText("Сохранить").setCta().onClick(() => this.close());
        new ButtonComponent(footer).setButtonText("Отмена").onClick(() => this.close());
    }

    private renderList(container: Element): void {
        container.empty();
        if (this.editingFilters.length === 0) {
            container.createEl('p', { text: 'У вас пока нет сохраненных фильтров', cls: 'empty-state-text' });
        }
        this.editingFilters.forEach((f, idx) => {
            const item = container.createDiv({ cls: 'modal-filter-mgmt-item' });
            const mainInfo = item.createDiv({ cls: 'mgmt-item-info' });
            mainInfo.createEl('b', { text: f.name });
            mainInfo.createEl('br');
            mainInfo.createSpan({ text: f.tags.map(t => `#${t}`).join(' '), cls: 'mgmt-item-tags' });
            
            const deleteBtn = item.createEl('button', { text: 'Удалить', cls: 'footer-btn delete-btn' });
            deleteBtn.onclick = () => {
                this.editingFilters.splice(idx, 1);
                this.renderList(container);
            };
        });
    }

    private renderTagsPreview(container: Element): void {
        container.empty();
        this.currentTags.forEach(t => {
            const tagEl = container.createSpan({ cls: 'filter-tag', text: `#${t}` });
            const x = tagEl.createSpan({ text: ' ×', cls: 'filter-tag-remove' });
            x.onclick = () => {
                this.currentTags = this.currentTags.filter(tag => tag !== t);
                this.renderTagsPreview(container);
            };
        });
    }
}
