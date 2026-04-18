import { Modal, TextComponent, ButtonComponent, TFile } from 'obsidian';
import { TeamService } from '../team/TeamService';
import { MonitoringPluginSettings, DEFAULT_SETTINGS } from '../settings/SettingsTab';

export class ResponsibleButtonModal extends Modal {
    private file: TFile;
    private onSave: (name: string) => void;
    private teamService: TeamService;
    private teamMembers: string[] = [];
    private currentUser: string = '';

    constructor(app: any, file: TFile, onSave: (name: string) => void) {
        super(app);
        this.file = file;
        this.onSave = onSave;
        this.teamService = new TeamService(app);
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: 'Выбрать ответственного' });

        this.teamMembers = await this.teamService.getTeamMembers();
        const cache = this.app.metadataCache.getFileCache(this.file);
        this.currentUser = this.settings.currentUser || '';
        
        const allMembers = [...this.teamMembers];
        if (this.currentUser && !allMembers.includes(this.currentUser)) {
            allMembers.push(this.currentUser);
        }

        const selectContainer = contentEl.createDiv();
        selectContainer.style.marginBottom = '20px';
        const select = selectContainer.createEl('select');
        select.style.width = '100%';
        select.style.padding = '8px';

        const currentValue = cache?.frontmatter?.['responsible'] || cache?.frontmatter?.['author'] || '';

        const emptyOption = select.createEl('option');
        emptyOption.text = 'Не назначен';
        emptyOption.value = '';
        if (!currentValue) emptyOption.selected = true;

        allMembers.forEach(member => {
            const option = select.createEl('option');
            option.text = member;
            option.value = member;
            if (currentValue === member) option.selected = true;
        });

        if (currentValue && !allMembers.includes(currentValue)) {
            const customOption = select.createEl('option');
            customOption.text = currentValue + ' (текущий)';
            customOption.value = currentValue;
            customOption.selected = true;
        }

        const customContainer = contentEl.createDiv();
        customContainer.style.marginBottom = '20px';
        const span = customContainer.createEl('span');
        span.textContent = 'Или введите новое имя:';
        span.style.display = 'block';
        span.style.marginBottom = '8px';
        
        const input = new TextComponent(customContainer);
        input.setPlaceholder('Новое имя');
        input.inputEl.style.width = '100%';

        input.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const value = input.inputEl.value.trim() || select.value;
                this.onSave(value);
                this.close();
            }
        });

        new ButtonComponent(contentEl)
            .setButtonText('+ Добавить в команду')
            .setClass('mod-small')
            .onClick(async () => {
                const newName = input.inputEl.value.trim();
                if (newName) {
                    await this.addToTeam(newName);
                    this.close();
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

    private get settings(): MonitoringPluginSettings {
        return (this.app as any).plugins.plugins['monitoring-plugin']?.settings || DEFAULT_SETTINGS;
    }
}