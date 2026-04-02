import { BaseView } from './BaseView';
import { TaskData, ProjectData } from './types';
import { DataService } from './DataService';
import { TFile } from 'obsidian';

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

    private readonly statuses: KanbanStatus[] = [
        { id: 'todo', label: 'Ожидание', color: 'orange', match: ['todo', 'pending', 'ожида', 'запланировано', 'to do'] },
        { id: 'active', label: 'В работе', color: 'blue', match: ['active', 'in progress', 'в работе', 'в процессе'] },
        { id: 'done', label: 'Завершено', color: 'green', match: ['done', 'completed', 'завершен', 'выполнено'] }
    ];

    constructor(app: any, dataService: DataService, templateManager: any, tasks: TaskData[], projects: ProjectData[], onRefresh: () => void) {
        super(app);
        this.dataService = dataService;
        this.templateManager = templateManager;
        this.tasks = tasks;
        this.projects = projects;
        this.onRefresh = onRefresh;
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
                    await this.dataService.updateItemStatus(data.path, status.label);
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
            this.openFile(item.path);
        };
    }
}
