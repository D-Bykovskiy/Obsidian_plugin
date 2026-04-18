import { Notice, Modal, TextComponent, ButtonComponent, TFile } from 'obsidian';
import { BaseView } from './BaseView';

interface Resource {
    name: string;
    url: string;
    icon: string;
}

interface ResourceGroup {
    name: string;
    icon?: string;
    items: Resource[];
}

export class ResourcesView extends BaseView {
    private groups: ResourceGroup[] = [];

    constructor(app: any) {
        super(app);
    }

    async render(container: Element): Promise<void> {
        container.addClass('monitoring-resources-view');

        this.groups = await this.parseResourcesFile();

        const header = container.createDiv({ cls: 'resources-header' });
        header.createEl('h2', { text: 'Ресурсы', cls: 'resources-title' });
        
        header.createEl('button', {
            cls: 'monitoring-glass-btn resources-add-group-btn',
            text: '+ Группу'
        }).onclick = () => this.showAddGroupModal();

        const content = container.createDiv({ cls: 'resources-content' });

        if (this.groups.length === 0) {
            content.createDiv({ 
                cls: 'empty-state-text',
                text: 'Ресурсы не найдены. Нажмите "+ Группу" чтобы создать первую.'
            });
            return;
        }

        for (const group of this.groups) {
            this.renderGroup(content, group);
        }
    }

    private renderGroup(container: Element, group: ResourceGroup): void {
        const groupEl = container.createDiv({ cls: 'resource-group' });
        
        const groupHeader = groupEl.createDiv({ cls: 'resource-group-header' });
        const groupTitle = groupHeader.createDiv({ cls: 'resource-group-title' });
        if (group.icon) {
            groupTitle.createSpan({ text: group.icon + ' ', cls: 'group-icon' });
        }
        groupTitle.createSpan({ text: group.name });
        
        groupHeader.createEl('button', {
            cls: 'resource-add-btn',
            text: '+'
        }).onclick = () => this.showAddResourceModal(group.name, group.icon);

        const groupItems = groupEl.createDiv({ cls: 'resource-group-items' });

        if (group.items.length === 0) {
            groupItems.createDiv({ text: 'Нет ресурсов', cls: 'empty-state-text' });
            return;
        }

        for (const item of group.items) {
            this.renderResourceItem(groupItems, item, group.name);
        }
    }

    private renderResourceItem(container: Element, item: Resource, groupName: string): void {
        const btn = container.createEl('button', { 
            cls: 'resource-item',
            text: `${item.icon} ${item.name}`
        });
        
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (item.url.startsWith('http') || item.url.startsWith('//')) {
                window.open(item.url, '_blank');
            } else {
                this.openInExplorer(item.url);
            }
        };

        btn.oncontextmenu = (e) => {
            e.preventDefault();
            this.showResourceContextMenu(e, item, groupName);
        };
    }

    private openInExplorer(path: string): void {
        let fullPath: string;
        
        if (/^[A-Za-z]:/.test(path)) {
            fullPath = path;
        } else {
            const vaultPath = (this.app.vault.adapter as any).basePath;
            if (!vaultPath) {
                new Notice('Не удалось открыть');
                return;
            }
            fullPath = `${vaultPath}\\${path.replace(/\//g, '\\')}`;
        }
        
        const { exec } = require('child_process');
        const normalizedPath = fullPath.replace(/\//g, '\\');
        exec(`powershell -Command "Start-Process '${normalizedPath.replace(/'/g, "''")}'"`, (err: any) => {
            if (err) {
                new Notice('Не удалось открыть');
                console.error(err);
            }
        });
    }

    private showResourceContextMenu(e: MouseEvent, item: Resource, groupName: string): void {
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.position = 'fixed';
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        menu.style.zIndex = '1000';

        const deleteBtn = menu.createDiv({ 
            cls: 'context-menu-item delete-item',
            text: 'Удалить'
        });
        deleteBtn.onclick = () => {
            this.deleteResource(groupName, item);
            menu.remove();
        };

        document.body.appendChild(menu);

        const closeMenu = (event: MouseEvent) => {
            if (!menu.contains(event.target as Node)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 10);
    }

    private async deleteResource(groupName: string, item: Resource): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath('resources.md') as TFile;
        if (!file) return;

        let content = await this.app.vault.read(file);
        
        const lines = content.split('\n');
        const newLines: string[] = [];
        let inGroup = false;
        let skipNextLine = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.match(/^##\s/) && line.includes(groupName)) {
                inGroup = true;
                newLines.push(line);
                continue;
            }
            
            if (inGroup && line.match(/^##\s/)) {
                inGroup = false;
            }

            if (inGroup && line.includes(`[${item.icon}](${item.url})`)) {
                skipNextLine = true;
                continue;
            }

            if (skipNextLine && line.trim() === '') {
                skipNextLine = false;
                continue;
            }

            newLines.push(line);
        }

        await this.app.vault.modify(file, newLines.join('\n'));
        new Notice('Ресурс удалён');
        this.render(this.containerEl.children[1]);
    }

    private showAddGroupModal(): void {
        new AddGroupModal(this.app, async (name, icon) => {
            await this.addGroup(name, icon);
            this.render(this.containerEl.children[1]);
        }).open();
    }

    private showAddResourceModal(groupName: string, groupIcon: string = '⚙️'): void {
        new AddResourceModal(this.app, async (name, url, icon) => {
            await this.addResource(groupName, groupIcon, name, url, icon);
            this.render(this.containerEl.children[1]);
        }).open();
    }

    private async addGroup(name: string, icon: string): Promise<void> {
        let file = this.app.vault.getAbstractFileByPath('resources.md') as TFile;
        let content = '';
        
        if (file) {
            content = await this.app.vault.read(file);
            content += '\n\n';
        }
        
        content += `## ${icon} ${name}`;
        
        if (file) {
            await this.app.vault.modify(file, content);
        } else {
            await this.app.vault.create('resources.md', `# Ресурсы\n\n${content}`);
        }
        
        new Notice(`Группа "${name}" создана`);
    }

    private async addResource(groupName: string, groupIcon: string, name: string, url: string, icon: string): Promise<void> {
        let file = this.app.vault.getAbstractFileByPath('resources.md') as TFile;
        if (!file) {
            await this.app.vault.create('resources.md', `# Ресурсы\n\n## ${groupIcon} ${groupName}\n- [${icon}](${url}) ${name}`);
            new Notice(`Ресурс "${name}" добавлен`);
            this.render(this.containerEl.children[1]);
            return;
        }

        let content = await this.app.vault.read(file);
        
        const lines = content.split('\n');
        let insertIndex = -1;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('##')) {
                const headerText = line.replace(/^##\s*/, '').trim();
                const parts = headerText.split(/\s+/);
                const actualName = parts.slice(parts[0].match(/^[^\w\s]/) ? 1 : 0).join(' ');
                if (actualName === groupName) {
                    insertIndex = i;
                    break;
                }
            }
        }
        
        if (insertIndex === -1) {
            new Notice('Группа не найдена: ' + groupName);
            return;
        }

        let insertPos = insertIndex + 1;
        while (insertPos < lines.length && lines[insertPos].trim() !== '' && !lines[insertPos].trim().startsWith('##')) {
            insertPos++;
        }

        const newLine = `- [${icon}](${url}) ${name}`;
        lines.splice(insertPos, 0, newLine);
        
        await this.app.vault.modify(file, lines.join('\n'));
        new Notice(`Ресурс "${name}" добавлен`);
        this.render(this.containerEl.children[1]);
    }

    private async parseResourcesFile(): Promise<ResourceGroup[]> {
        const file = this.app.vault.getAbstractFileByPath('resources.md') as TFile;
        if (!file) return this.getDefaultGroups();

        try {
            const content = await this.app.vault.read(file);
            return this.parseResourcesContent(content);
        } catch (e) {
            console.error('Error reading resources.md:', e);
            return this.getDefaultGroups();
        }
    }

    private getDefaultGroups(): ResourceGroup[] {
        return [
            { name: 'Администрирование', icon: '⚙️', items: [] },
            { name: 'Разработка', icon: '🔧', items: [] },
            { name: 'Справочные материалы', icon: '📚', items: [] }
        ];
    }

    private parseResourcesContent(content: string): ResourceGroup[] {
        const groups: ResourceGroup[] = [];
        const lines = content.split('\n');
        
        let currentGroup: ResourceGroup | null = null;

        for (const line of lines) {
            const groupMatch = line.match(/^##\s*(.+)$/);
            if (groupMatch) {
                if (currentGroup) {
                    groups.push(currentGroup);
                }
                const parts = groupMatch[1].trim().split(/\s+/);
                const icon = parts[0].match(/^[^\w\s]/) ? parts[0] : '';
                const name = icon ? parts.slice(1).join(' ') : groupMatch[1].trim();
                currentGroup = { name, icon, items: [] };
                continue;
            }

            const itemMatch = line.match(/^-\s*\[([^\]]+)\]\(([^)]+)\)\s*(.+)?$/);
            if (itemMatch && currentGroup) {
                currentGroup.items.push({
                    icon: itemMatch[1],
                    url: itemMatch[2],
                    name: itemMatch[3]?.trim() || itemMatch[2]
                });
            }
        }

        if (currentGroup) {
            groups.push(currentGroup);
        }

        return groups.length > 0 ? groups : this.getDefaultGroups();
    }

    private get containerEl(): HTMLElement {
        return this.app.workspace.getLeavesOfType('markdown')[0]?.view?.containerEl || document.body;
    }
}

const ICON_LIST = ['📁', '📂', '⚙️', '🔧', '🔗', '🌐', '📚', '📝', '📊', '📈', '💼', '🏠', '🎯', '📋', '🗂️', '🖥️', '📱', '☁️', '🔒', '🛠️'];

class AddGroupModal extends Modal {
    private onSubmit: (name: string, icon: string) => void;
    private selectedIcon: string = '📁';

    constructor(app: any, onSubmit: (name: string, icon: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: 'Добавить группу' });

        const iconContainer = contentEl.createDiv({ cls: 'icon-picker-container' });
        iconContainer.createDiv({ text: 'Выберите иконку:', cls: 'icon-picker-label' });
        
        const iconGrid = iconContainer.createDiv({ cls: 'icon-picker-grid' });
        ICON_LIST.forEach(icon => {
            const iconBtn = iconGrid.createEl('button', { text: icon, cls: 'icon-picker-btn' });
            iconBtn.onclick = () => {
                this.selectedIcon = icon;
                iconGrid.querySelectorAll('.icon-picker-btn').forEach(b => b.removeClass('selected'));
                iconBtn.addClass('selected');
            };
        });
        iconGrid.querySelector('button')?.addClass('selected');

        const nameInput = new TextComponent(contentEl);
        nameInput.setPlaceholder('Название группы');
        nameInput.inputEl.style.width = '100%';
        nameInput.inputEl.style.marginBottom = '20px';

        nameInput.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const name = nameInput.getValue().trim();
                if (name) {
                    this.onSubmit(name, this.selectedIcon);
                    this.close();
                }
            }
        });

        new ButtonComponent(contentEl)
            .setButtonText('Добавить')
            .setCta()
            .onClick(() => {
                const name = nameInput.getValue().trim();
                if (name) {
                    this.onSubmit(name, this.selectedIcon);
                    this.close();
                }
            });
    }
}

class AddResourceModal extends Modal {
    private onSubmit: (name: string, url: string, icon: string) => void;
    private selectedIcon: string = '🔗';

    constructor(app: any, onSubmit: (name: string, url: string, icon: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: 'Добавить ресурс' });

        const iconContainer = contentEl.createDiv({ cls: 'icon-picker-container' });
        iconContainer.createDiv({ text: 'Выберите иконку:', cls: 'icon-picker-label' });
        
        const iconGrid = iconContainer.createDiv({ cls: 'icon-picker-grid' });
        ICON_LIST.forEach(icon => {
            const iconBtn = iconGrid.createEl('button', { text: icon, cls: 'icon-picker-btn' });
            iconBtn.onclick = () => {
                this.selectedIcon = icon;
                iconGrid.querySelectorAll('.icon-picker-btn').forEach(b => b.removeClass('selected'));
                iconBtn.addClass('selected');
            };
        });
        iconGrid.querySelector('button')?.addClass('selected');

        const nameInput = new TextComponent(contentEl);
        nameInput.setPlaceholder('Название');
        nameInput.inputEl.style.width = '100%';
        nameInput.inputEl.style.marginBottom = '10px';

        const urlInput = new TextComponent(contentEl);
        urlInput.setPlaceholder('URL или путь к папке (https://... или C:\\...)');
        urlInput.inputEl.style.width = '100%';
        urlInput.inputEl.style.marginBottom = '20px';

        const submitCallback = () => {
            const name = nameInput.getValue().trim();
            const url = urlInput.getValue().trim();
            if (name && url) {
                this.onSubmit(name, url, this.selectedIcon);
                this.close();
            }
        };

        nameInput.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitCallback();
            }
        });

        urlInput.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitCallback();
            }
        });

        new ButtonComponent(contentEl)
            .setButtonText('Добавить')
            .setCta()
            .onClick(submitCallback);
    }
}