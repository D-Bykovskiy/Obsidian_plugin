import { App, TFile } from 'obsidian';
import { TaskData, ProjectData, VaultData, FilterData, IncidentData, SimpleNoteData } from './types';

export abstract class BaseView {
    protected app: App;

    constructor(app: App) {
        this.app = app;
    }

    getStatusClass(status: string): string {
        status = status.toLowerCase();
        if (status.includes('завершен') || status.includes('выполнено') || status === 'done' || status === 'completed') return 'status-success';
        if (status.includes('в работе') || status.includes('в процессе') || status === 'active' || status === 'in progress') return 'status-active';
        if (status.includes('запланировано') || status.includes('ожидает') || status === 'pending') return 'status-pending';
        return 'status-default';
    }

    openFile(path: string): void {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            this.app.workspace.getLeaf(false).openFile(file);
        }
    }

    createEmptyState(container: Element, message: string): void {
        container.createEl('p', { text: message, cls: 'empty-state-text' });
    }

    createHeader(container: Element, title: string): HTMLElement {
        return container.createEl('h3', { text: title });
    }

    createTable(container: Element, headers: string[]): { thead: HTMLElement; tbody: HTMLElement } {
        const table = container.createEl('table', { cls: 'monitoring-data-table' });
        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        headers.forEach(h => headerRow.createEl('th', { text: h }));
        const tbody = table.createEl('tbody');
        return { thead, tbody };
    }

    createLinkCell(cell: HTMLElement, text: string, path: string): HTMLAnchorElement {
        const link = cell.createEl('a', { text, cls: 'incident-link' });
        link.onclick = (e) => {
            e.preventDefault();
            this.openFile(path);
        };
        return link;
    }

    createStatusBadge(cell: HTMLElement, status: string): HTMLElement {
        return cell.createSpan({ text: status, cls: `status-badge ${this.getStatusClass(status)}` });
    }
}
