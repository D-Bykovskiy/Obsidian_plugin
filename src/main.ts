import { Plugin, Notice, TFile, MarkdownRenderChild, WorkspaceLeaf, Editor, Menu, MarkdownView, MarkdownFileInfo } from 'obsidian';
import { LLMService } from './llm/LLMService';
import { OutlookService } from './outlook/OutlookService';
import { TemplateManager } from './notes/TemplateManager';
import { DailyService } from './daily/DailyService';
import { TeamService } from './team/TeamService';
import { MonitoringSettingTab, DEFAULT_SETTINGS, MonitoringPluginSettings } from './settings/SettingsTab';
import { ChatView, CHAT_VIEW_TYPE } from './chat/ChatView';
import { MainPageView, MAIN_PAGE_VIEW_TYPE } from './main-page/MainPageView';
import { TagModal } from './modals/TagModal';
import { ResourceModal } from './modals/ResourceModal';
import { NewTaskModal } from './modals/NewTaskModal';
import { ResponsibleButtonModal } from './modals/ResponsibleButtonModal';
import { MonitoringDurationChild } from './MonitoringDurationChild';

export default class MonitoringPlugin extends Plugin {
    settings: MonitoringPluginSettings;
    llmService: LLMService;
    outlookService: OutlookService;
    templateManager: TemplateManager;
    dailyService: DailyService;

    async onload() {
        await this.loadSettings();

        // Initialize the submodules
        this.llmService = new LLMService(this.settings);
        this.outlookService = new OutlookService(this.settings, this.app);
        this.templateManager = new TemplateManager(this.app, this.settings);
        this.dailyService = new DailyService(this.app, this.settings);

        // Register Chat View
        this.registerView(
            CHAT_VIEW_TYPE,
            (leaf) => new ChatView(leaf, this.llmService)
        );

        this.registerView(
            MAIN_PAGE_VIEW_TYPE,
            (leaf) => new MainPageView(leaf, this)
        );

        // Ribbon icons
        this.addRibbonIcon('mail', 'Импортировать почту', async () => {
            await this.processEmails();
        });

        this.addRibbonIcon('message-square', 'Корпоративный ИИ Чат', async () => {
            await this.activateChatView();
        });

        this.addRibbonIcon('brain', 'Главная панель проектов', async () => {
            await this.activateMainPageView();
        });

        // Commands
        this.addCommand({
            id: 'import-mail',
            name: 'Обновить почту (Import Mail)',
            callback: async () => {
                await this.processEmails();
            }
        });

        this.addCommand({
            id: 'open-ai-chat',
            name: 'Открыть корпоративный чат (Open AI Chat)',
            callback: async () => {
                await this.activateChatView();
            }
        });

        // Register custom markdown blocks
        this.registerMarkdownCodeBlockProcessor("monitoring-ui", (source, el, ctx) => {
            const container = el.createDiv({ cls: 'monitoring-dashboard-ui' });
            container.createEl('h4', { text: 'Управление отслеживанием' });
            const wrapper = container.createDiv({ cls: 'monitoring-input-wrapper' });
            
            const input = wrapper.createEl('input', { 
                type: 'text', 
                placeholder: 'Введите ключевые слова темы...',
                cls: 'monitoring-topic-input'
            });
            const btn = wrapper.createEl('button', { text: 'Добавить', cls: 'monitoring-add-btn' });
            
            btn.onclick = async () => {
                const topic = input.value.trim();
                if (!topic) return;
                
                const dashboardFile = this.app.vault.getAbstractFileByPath(this.settings.dashboardNoteName) as TFile;
                if (dashboardFile) {
                    await this.app.fileManager.processFrontMatter(dashboardFile, (fm) => {
                        if (!fm['tracked_subjects']) fm['tracked_subjects'] = [];
                        if (!Array.isArray(fm['tracked_subjects'])) fm['tracked_subjects'] = [fm['tracked_subjects']];
                        if (!fm['tracked_subjects'].includes(topic)) fm['tracked_subjects'].push(topic);
                    });
                    new Notice(`Тема "${topic}" добавлена!`);
                    input.value = '';
                } else {
                    new Notice('Файл дашборда не найден!');
                }
            };
        });

        this.registerMarkdownCodeBlockProcessor("monitoring-duration", (source, el, ctx) => {
            const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
            if (!(file instanceof TFile)) return;

            const child = new MonitoringDurationChild(el, this, file);
            ctx.addChild(child);
        });

        this.registerMarkdownPostProcessor((el) => {
            const activeFile = this.app.workspace.getActiveFile();
            if (!activeFile || !(activeFile instanceof TFile)) return;
            if (!activeFile.path.match(/^daily-.*\//)) return;
            if (el.querySelector('.monitoring-duration-container')) return;

            const container = el.createDiv({ cls: 'monitoring-duration-container' });
            container.style.marginBottom = '20px';
            const child = new MonitoringDurationChild(container, this, activeFile);
            child.onload();
        });

        this.addSettingTab(new MonitoringSettingTab(this.app, this));

        this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
            const selection = editor.getSelection();
            if (!selection) return;

            menu.addItem((item) => {
                item.setTitle('ИИ: Орфография')
                    .setIcon('check')
                    .onClick(async () => {
                        new Notice('Проверка орфографии...');
                        try {
                            const fixed = await this.llmService.checkSpelling(selection);
                            editor.replaceSelection(fixed);
                            new Notice('Орфография исправлена');
                        } catch (e) {
                            new Notice('Ошибка: ' + e.message);
                        }
                    });
            });

            menu.addItem((item) => {
                item.setTitle('ИИ: Переформулировать')
                    .setIcon('refresh-cw')
                    .onClick(async () => {
                        new Notice('Переформулирование...');
                        try {
                            const rephrased = await this.llmService.rephrase(selection);
                            editor.replaceSelection(rephrased);
                            new Notice('Текст переформулирован');
                        } catch (e) {
                            new Notice('Ошибка: ' + e.message);
                        }
                    });
            });
        });
    }

    async activateChatView() {
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0];
        if (!leaf) {
            leaf = workspace.getRightLeaf(false);
            if (leaf) await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
        }
        if (leaf) workspace.revealLeaf(leaf);
    }

    async activateMainPageView() {
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(MAIN_PAGE_VIEW_TYPE)[0];
        if (!leaf) {
            leaf = workspace.getLeaf(true);
            await leaf.setViewState({ type: MAIN_PAGE_VIEW_TYPE, active: true });
        }
        if (leaf) workspace.revealLeaf(leaf);
    }

    async processEmails() {
        new Notice('Запуск сканирования почты...');
        try {
            const allEmails = await this.outlookService.fetchEmails();
            allEmails.reverse(); 
            let newEmails = allEmails.filter(e => !this.settings.scannedEmailIds.includes(e.entryId));
            if (newEmails.length === 0) newEmails = allEmails.slice(Math.max(allEmails.length - 10, 0));
            if (newEmails.length === 0) { new Notice('Папка пуста.'); return; }

            const files = this.app.vault.getMarkdownFiles();
            const projectFiles: {file: TFile, tracked_emails: string[]}[] = [];
            
            for (const file of files) {
                const cache = this.app.metadataCache.getFileCache(file);
                const type = cache?.frontmatter?.['type'];
                if (type === 'project') {
                    const tracked = cache?.frontmatter?.['tracked_emails'] || [];
                    if (tracked.length > 0) {
                        projectFiles.push({
                            file,
                            tracked_emails: tracked.map((t: string) => t.toLowerCase())
                        });
                    }
                }
            }

            let processedCount = 0;
            for (const email of newEmails) {
                const topicLower = email.conversationTopic.toLowerCase();
                const matchedProjects = projectFiles.filter(p => 
                    p.tracked_emails.some(te => topicLower.includes(te))
                );

                if (matchedProjects.length > 0) {
                    for (const project of matchedProjects) {
                        await this.addEmailToProject(project.file, email);
                    }
                } else {
                    const existingNote = await this.templateManager.getIncidentNoteByTopic(email.conversationTopic);
                    if (existingNote) {
                        const content = await this.templateManager.readNoteContent(existingNote);
                        const match = content.match(/## Текущее саммари инцидента\n([\s\S]*?)\n---/m);
                        const oldSummary = match ? match[1].trim() : 'Логов нет.';
                        const combinedSummary = await this.llmService.updateIncidentSummary(oldSummary, email.bodyPreview);
                        await this.templateManager.updateIncidentNote(existingNote, email, combinedSummary);
                    } else {
                        const summary = await this.llmService.summarizeIncident(email.bodyPreview);
                        await this.templateManager.createIncidentNote(email, summary);
                    }
                }
                processedCount++;
                if (!this.settings.scannedEmailIds.includes(email.entryId)) this.settings.scannedEmailIds.push(email.entryId);
            }
            await this.saveSettings();
            new Notice(processedCount === 0 ? 'Нет писем по отслеживаемым темам.' : `Готово! Обработано писем: ${processedCount}`);
        } catch (error) {
            console.error(error);
            new Notice('Ошибка при импорте: ' + error.message);
        }
    }

    private async addEmailToProject(projectFile: TFile, email: any): Promise<void> {
        const vault = this.app.vault;
        const content = await vault.read(projectFile);
        
        const emailEntry = `- [${email.conversationTopic}](${email.subject}) — ${email.sender} (${new Date(email.receivedDateTime).toLocaleDateString('ru-RU')})`;
        
        let newContent = content;
        if (content.includes('## 📬 Письма')) {
            const emailSectionMatch = content.match(/(## 📬 Письма\n)([\s\S]*)/);
            if (emailSectionMatch) {
                newContent = emailSectionMatch[1] + emailEntry + '\n' + emailSectionMatch[2];
            }
        } else {
            newContent = content + '\n## 📬 Письма\n' + emailEntry + '\n';
        }
        
        await vault.modify(projectFile, newContent);
    }

    onunload() {}

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.llmService.updateSettings(this.settings);
        this.outlookService.updateSettings(this.settings);
        this.templateManager.updateSettings(this.settings);
    }

    async addResourceToNote(file: TFile, link: string, description: string) {
        const content = await this.app.vault.read(file);
        const header = "## 🔗 База материалов и ресурсов";
        const normalizedLink = link.startsWith('http') ? `[Открыть](${link})` : `[Открыть](file:///${link.replace(/\\/g, '/')})`;
        const newRow = `| ${normalizedLink} | ${description || link} |\n`;
        let newContent = content.includes(header) ? content.replace(header, `${header}\n${newRow}`) : content + `\n\n${header}\n| Ресурс | Описание |\n| --- | --- |\n${newRow}`;
        await this.app.vault.modify(file, newContent);
    }

    async addTagToNote(file: TFile, tag: string) {
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            let tags = fm['tags'] || [];
            if (typeof tags === 'string') tags = tags.split(',').map(t => t.trim());
            if (!Array.isArray(tags)) tags = [tags];
            const cleanTag = tag.startsWith('#') ? tag.substring(1) : tag;
            if (!tags.includes(cleanTag)) {
                tags.push(cleanTag);
                fm['tags'] = tags;
            }
        });
    }

    async removeTagFromNote(file: TFile, tag: string) {
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            let tags = fm['tags'] || [];
            if (typeof tags === 'string') tags = tags.split(',').map(t => t.trim());
            if (!Array.isArray(tags)) tags = [tags];
            const cleanTag = tag.startsWith('#') ? tag.substring(1) : tag;
            fm['tags'] = tags.filter((t: string) => t !== cleanTag);
        });
    }

    async moveFileToFolder(file: TFile, folderName: string) {
        try {
            const filePath = file.path;
            const pathParts = filePath.split('/');
            pathParts.pop();
            const relativePath = pathParts.join('/');
            
            const targetFolder = relativePath ? `${folderName}/${relativePath}` : folderName;
            
            const folderExists = this.app.vault.getAbstractFileByPath(targetFolder);
            if (!folderExists) {
                await this.app.vault.createFolder(targetFolder);
            }
            
            const newPath = `${targetFolder}/${file.name}`;
            if (this.app.vault.getAbstractFileByPath(newPath)) { new Notice(`Файл уже существует в "${targetFolder}"`); return; }
            await this.app.fileManager.renameFile(file, newPath);
            new Notice(`Заметка перемещена в "${targetFolder}"`);
        } catch (e) {
            console.error(e);
            new Notice(`Ошибка при перемещении: ${e.message}`);
        }
    }
}
