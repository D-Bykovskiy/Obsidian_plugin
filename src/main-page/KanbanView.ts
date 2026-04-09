import { BaseView } from './BaseView';
import { TaskData, ProjectData } from './types';
import { DataService } from './DataService';
import { TFile, Modal, TextComponent, ButtonComponent } from 'obsidian';
import MonitoringPlugin from '../main';
import { TeamService } from '../team/TeamService';

interface KanbanStatus {
    id: string;
    label: string;
    color: string;
    match: string[];
}

export class KanbanView extends BaseView {
    private dataService: DataService;
    private templateManager: any;
    private tasks: TaskData[];
    private projects: ProjectData[];
    private onRefresh: () => void;
    private teamService: TeamService;
    private teamMembers: string[] = [];
    private currentUser: string = '';

    private readonly statuses: KanbanStatus[] = [
        { id: 'todo', label: 'Ожидание', color: 'orange', match: ['todo', 'pending', 'ожида', 'запланировано', 'to do'] },
        { id: 'active', label: 'В работе', color: 'blue', match: ['active', 'in progress', 'в работе', 'в процессе'] },
        { id: 'done', label: 'Завершено', color: 'green', match: ['done', 'completed', 'завершен', 'выполнено'] }
    ];

    constructor(app: any, dataService: DataService, templateManager: any, tasks: TaskData[], projects: ProjectData[], onRefresh: () => void, teamMembers: string[] = [], currentUser: string = '') {
        super(app);
        this.dataService = dataService;
        this.templateManager = templateManager;
        this.tasks = tasks;
        this.projects = projects;
        this.onRefresh = onRefresh;
        this.teamService = new TeamService(app);
        this.teamMembers = teamMembers;
        this.currentUser = currentUser;
    }

    render(container: Element): void {
        this.renderBoard(container, "Доска Проектов", this.projects, 'project');
        this.renderBoard(container, "Доска Задач", this.tasks, 'task');
    }

    private renderBoard(container: Element, title: string, items: any[], type: 'task' | 'project'): void {
        const wrapper = document.createElement('div');
        wrapper.className = 'kanban-section';
        
        const heading = document.createElement('h3');
        heading.textContent = title;
        heading.style.marginTop = '20px';
        wrapper.appendChild(heading);

        const board = wrapper.createDiv({ cls: 'monitoring-kanban-board' });
        
        this.statuses.forEach(status => {
            const column = board.createDiv({ cls: `kanban-column ${status.color}` });
            column.createEl('h4', { text: status.label });
            
            const cardsContainer = column.createDiv({ cls: 'kanban-cards' });
            
            this.setupDragDrop(column, cardsContainer, status, items, type);

            const filtered = this.filterByStatus(items, status);
            
            if (filtered.length === 0) {
                cardsContainer.createDiv({ text: 'Пусто', cls: 'kanban-empty' });
            }

            filtered.forEach(item => {
                this.renderCard(cardsContainer, item, type);
            });
        });

        container.appendChild(wrapper);
    }

    private filterByStatus(items: any[], status: KanbanStatus): any[] {
        return items.filter(item => {
            const s = (item.status || "").toLowerCase().trim();
            const labelLower = status.label.toLowerCase();
            return status.match.some(m => s.includes(m)) || 
                   s === labelLower || 
                   s.replace(/\s+/g, '') === status.id;
        });
    }

    private setupDragDrop(column: HTMLElement, cardsContainer: HTMLElement, status: KanbanStatus, items: any[], type: 'task' | 'project'): void {
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
                    const file = this.app.vault.getAbstractFileByPath(data.path);
                    const statusValue = status.id === 'todo' ? 'To Do' : status.id === 'active' ? 'In Progress' : status.id === 'done' ? 'Done' : status.label;
                    await this.dataService.updateItemStatus(data.path, statusValue);
                    if (this.templateManager && file instanceof TFile && file.basename.startsWith('Task-')) {
                        await this.templateManager.updateSubtaskStatusIcon(file);
                    }
                    await new Promise(r => setTimeout(r, 400));
                    this.onRefresh();
                }
            } catch (err) {
                console.error("Drop error:", err);
            }
        });
    }

    private renderCard(cardsContainer: HTMLElement, item: any, type: 'task' | 'project'): void {
        const cardClass = type === 'task' ? 'task-card priority-' + item.priority : 'project-card';
        const card = cardsContainer.createDiv({ 
            cls: 'kanban-card ' + cardClass
        });
        
        if (type === 'project' && item.priority) {
            card.addClass(`priority-${item.priority}`);
        }
        card.setAttribute('draggable', 'true');
        
        card.createDiv({ cls: 'card-title', text: item.name });
        
        let metaText = '';
        if (type === 'task') {
            metaText = item.deadline || 'Без срока';
        } else {
            metaText = item.goal || 'Цель не задана';
        }
        
        if (item.responsible) {
            metaText += ` | 👤 ${item.responsible}`;
        }
        
        card.createDiv({ cls: 'card-meta', text: metaText });

        card.addEventListener('dragstart', (e) => {
            e.dataTransfer?.setData('text/plain', JSON.stringify({ path: item.path, type: type }));
            card.addClass('is-dragging');
        });
        
        card.addEventListener('dragend', () => {
            card.removeClass('is-dragging');
        });

        card.onclick = () => {
            this.openFile(item.path);
        };

        card.oncontextmenu = (e) => {
            e.preventDefault();
            this.showResponsibleModal(item, type);
        };
    }

    private async showResponsibleModal(item: any, type: 'task' | 'project'): Promise<void> {
        new ResponsibleModal(
            this.app, 
            item, 
            type, 
            async (newResponsible) => {
                await this.updateResponsible(item.path, newResponsible);
                this.onRefresh();
            },
            this.teamMembers,
            this.currentUser
        ).open();
    }

    private async updateResponsible(path: string, responsible: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!file || !(file instanceof TFile)) return;

        const content = await this.app.vault.read(file);
        const lines = content.split('\n');
        const newLines: string[] = [];
        let inFrontmatter = false;
        let frontmatterEnded = false;

        for (const line of lines) {
            if (line.trim() === '---' && !inFrontmatter) {
                inFrontmatter = true;
                newLines.push(line);
                continue;
            }
            if (line.trim() === '---' && inFrontmatter && !frontmatterEnded) {
                frontmatterEnded = true;
                newLines.push(line);
                continue;
            }

            if (inFrontmatter && !frontmatterEnded) {
                if (line.match(/^responsible:/)) {
                    if (responsible) {
                        newLines.push(`responsible: "${responsible}"`);
                    }
                    continue;
                }
            }

            newLines.push(line);
        }

        if (inFrontmatter && !frontmatterEnded) {
            if (responsible) {
                newLines.push(`responsible: "${responsible}"`);
            }
            newLines.push('---');
        } else if (responsible) {
            const insertIdx = newLines.findIndex(l => l.trim() === '---');
            if (insertIdx !== -1) {
                newLines.splice(insertIdx + 1, 0, `responsible: "${responsible}"`);
            }
        }

        await this.app.vault.modify(file, newLines.join('\n'));
    }
}

class ResponsibleModal extends Modal {
    private item: any;
    private type: 'task' | 'project';
    private onSave: (responsible: string) => void;
    private teamMembers: string[] = [];
    private currentUser: string = '';

    constructor(app: any, item: any, type: 'task' | 'project', onSave: (responsible: string) => void, teamMembers: string[] = [], currentUser: string = '') {
        super(app);
        this.item = item;
        this.type = type;
        this.onSave = onSave;
        this.teamMembers = teamMembers;
        this.currentUser = currentUser;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: `Ответственный: ${this.item.name}` });

        const selectContainer = contentEl.createDiv();
        selectContainer.style.marginBottom = '20px';
        const select = selectContainer.createEl('select');
        select.style.width = '100%';
        select.style.padding = '8px';
        select.style.marginBottom = '16px';

        const emptyOption = select.createEl('option');
        emptyOption.text = 'Не назначен';
        emptyOption.value = '';
        if (!this.item.responsible) emptyOption.selected = true;

        const allMembers = [...this.teamMembers];
        if (this.currentUser && !allMembers.includes(this.currentUser)) {
            allMembers.push(this.currentUser);
        }
        
        allMembers.forEach(member => {
            const option = select.createEl('option');
            option.text = member;
            option.value = member;
            if (this.item.responsible === member) {
                option.selected = true;
            }
        });

        if (this.item.responsible && !this.teamMembers.includes(this.item.responsible)) {
            const customOption = select.createEl('option');
            customOption.text = this.item.responsible + ' (текущий)';
            customOption.value = this.item.responsible;
            customOption.selected = true;
        }

        const customContainer = contentEl.createDiv();
        customContainer.style.marginBottom = '20px';
        const span = customContainer.createEl('span');
        span.textContent = 'Или введите новое имя:';
        span.style.display = 'block';
        span.style.marginBottom = '8px';
        
        const input = new TextComponent(customContainer);
        input.setPlaceholder('Новое имя ответственного');
        input.inputEl.style.width = '100%';

        const addTeamBtn = new ButtonComponent(contentEl)
            .setButtonText('+ Добавить в команду')
            .setClass('mod-small')
            .onClick(async () => {
                const newName = input.inputEl.value.trim();
                if (newName) {
                    await this.addToTeam(newName);
                    this.close();
                } else {
                    input.inputEl.focus();
                }
            });

        const btnContainer = contentEl.createDiv();
        btnContainer.style.display = 'flex';
        btnContainer.style.gap = '10px';
        btnContainer.style.marginTop = '16px';
        
        new ButtonComponent(btnContainer)
            .setButtonText('Сохранить')
            .setCta()
            .onClick(() => {
                const value = input.inputEl.value.trim() || select.value;
                this.onSave(value);
                this.close();
            });

        new ButtonComponent(btnContainer)
            .setButtonText('Отмена')
            .onClick(() => this.close());
    }

    private async addToTeam(name: string): Promise<void> {
        const routinesFile = this.app.vault.getAbstractFileByPath('routines.md');
        if (!routinesFile || !(routinesFile instanceof TFile)) {
            const content = `# Команда\n- ${name}\n`;
            await this.app.vault.create('routines.md', content);
        } else {
            const content = await this.app.vault.read(routinesFile);
            if (!content.includes('# Команда') && !content.includes('# команда')) {
                const newContent = content + '\n# Команда\n- ' + name + '\n';
                await this.app.vault.modify(routinesFile, newContent);
            } else if (!content.includes('- ' + name)) {
                const lines = content.split('\n');
                let inTeamSection = false;
                const newLines: string[] = [];
                
                for (const line of lines) {
                    if (line.trim().toLowerCase() === '# команда') {
                        inTeamSection = true;
                    }
                    if (inTeamSection && (line.startsWith('# ') || line.startsWith('## '))) {
                        newLines.push(line);
                        newLines.push('- ' + name);
                        inTeamSection = false;
                        continue;
                    }
                    newLines.push(line);
                }
                
                if (inTeamSection) {
                    newLines.push('- ' + name);
                }
                
                await this.app.vault.modify(routinesFile, newLines.join('\n'));
            }
        }
        
        this.onSave(name);
    }
}
