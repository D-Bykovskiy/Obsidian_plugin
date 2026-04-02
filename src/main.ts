import { Plugin, Notice, TFile, Modal, TextComponent, ButtonComponent, MarkdownRenderChild, WorkspaceLeaf } from 'obsidian';
import { LLMService } from './llm/LLMService';
import { OutlookService } from './outlook/OutlookService';
import { TemplateManager } from './notes/TemplateManager';
import { DailyService } from './daily/DailyService';
import { MonitoringSettingTab, DEFAULT_SETTINGS, MonitoringPluginSettings } from './settings/SettingsTab';
import { ChatView, CHAT_VIEW_TYPE } from './chat/ChatView';
import { MainPageView, MAIN_PAGE_VIEW_TYPE } from './main-page/MainPageView';

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

        this.addSettingTab(new MonitoringSettingTab(this.app, this));
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

            const dashboardFile = this.app.vault.getAbstractFileByPath(this.settings.dashboardNoteName) as TFile;
            let trackedSubjects: string[] = [];
            if (dashboardFile) {
                const cache = this.app.metadataCache.getFileCache(dashboardFile);
                if (cache?.frontmatter?.['tracked_subjects']) {
                    trackedSubjects = cache.frontmatter['tracked_subjects'].map((s: string) => s.toLowerCase());
                }
            }

            let processedCount = 0;
            for (const email of newEmails) {
                if (trackedSubjects.length > 0) {
                    const topicLower = email.conversationTopic.toLowerCase();
                    if (!trackedSubjects.some(ts => topicLower.includes(ts))) continue;
                }
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
            if (!this.app.vault.getAbstractFileByPath(folderName)) await this.app.vault.createFolder(folderName);
            const newPath = `${folderName}/${file.name}`;
            if (this.app.vault.getAbstractFileByPath(newPath)) { new Notice(`Файл уже существует в "${folderName}"`); return; }
            await this.app.fileManager.renameFile(file, newPath);
            new Notice(`Заметка перемещена в "${folderName}"`);
        } catch (e) {
            console.error(e);
            new Notice(`Ошибка при перемещении: ${e.message}`);
        }
    }
}

class MonitoringDurationChild extends MarkdownRenderChild {
    plugin: MonitoringPlugin;
    file: TFile;
    rootContainer: HTMLDivElement;

    constructor(containerEl: HTMLElement, plugin: MonitoringPlugin, file: TFile) {
        super(containerEl);
        this.plugin = plugin;
        this.file = file;
    }

    async onload() {
        this.rootContainer = this.containerEl.createDiv({ cls: 'monitoring-duration-wrapper' });
        await this.renderUI();
        this.registerEvent(this.plugin.app.metadataCache.on('changed', (f) => {
            if (f.path === this.file.path) this.renderUI();
        }));
    }

    async renderUI() {
        const rootContainer = this.rootContainer;
        rootContainer.empty();
        const cache = this.plugin.app.metadataCache.getFileCache(this.file);
        let currentDeadline = cache?.frontmatter?.['deadline'] || "";
        
        const isSimpleNote = cache?.frontmatter?.['type'] === 'note';
        
        const renderCollapsed = () => {
            rootContainer.empty();
            const panelContainer = rootContainer.createDiv({ cls: 'monitoring-controls-panel' });

            if (!isSimpleNote) {
                const row1 = panelContainer.createDiv({ cls: 'monitoring-split-row' });
                
                const dContainer = row1.createDiv({ cls: 'monitoring-half-row' });
                dContainer.createEl('button', {
                    cls: 'monitoring-glass-btn monitoring-btn-full',
                    text: currentDeadline ? `⏳ ${currentDeadline}` : '📅 Срок'
                }).onclick = () => renderExpanded();

                const pContainer = row1.createDiv({ cls: 'monitoring-half-row' });
                let isPExp = false;
                const renderPUI = () => {
                    pContainer.empty();
                    const priority = parseInt(cache?.frontmatter?.['priority']) || 3;
                    if (!isPExp) {
                        const tBtn = pContainer.createEl('button', { cls: 'monitoring-glass-btn priority-toggle-btn monitoring-btn-full' });
                        tBtn.createSpan({ text: '⭐ ', attr: { style: 'margin-right: 4px;' } });
                        tBtn.createSpan({ text: priority.toString(), cls: `priority-badge priority-${priority}` });
                        tBtn.onclick = () => { isPExp = true; renderPUI(); };
                    } else {
                        const wrap = pContainer.createDiv({ cls: 'priority-slider-mini-wrapper' });
                        const slider = wrap.createEl('input', { type: 'range', cls: 'priority-slider', attr: { min: '1', max: '5', value: priority.toString() } });
                        slider.onchange = async () => {
                            await this.plugin.app.fileManager.processFrontMatter(this.file, (fm) => { fm['priority'] = parseInt(slider.value); });
                            isPExp = false; renderPUI();
                        };
                        wrap.createEl('button', { cls: 'mini-close-btn', text: '×' }).onclick = () => { isPExp = false; renderPUI(); };
                    }
                };
                renderPUI();

                const statusRow = panelContainer.createDiv({ cls: 'monitoring-status-row segmented-control' });
                [{ l: 'План', v: 'To Do', i: '🎯' }, { l: 'В работе', v: 'In Progress', i: '⚡' }, { l: 'Готово', v: 'Done', i: '✅' }].forEach(s => {
                    const b = statusRow.createEl('button', { cls: 'monitoring-glass-btn status-segment-btn', text: `${s.i} ${s.l}` });
                    if (cache?.frontmatter?.['status'] === s.v) b.addClass('is-active-status');
                    b.onclick = async () => { 
                        await this.plugin.app.fileManager.processFrontMatter(this.file, (fm) => { fm['status'] = s.v; });
                        if (this.file.basename.startsWith('Task-')) {
                            await this.plugin.templateManager.updateSubtaskStatusIcon(this.file);
                        }
                    };
                });
            }

            const toolsRow = panelContainer.createDiv({ cls: 'monitoring-tools-row' });
            toolsRow.createEl('button', { cls: 'monitoring-glass-btn tool-btn', text: '➕ Задачу' }).onclick = () => {
                // Get clean tag and project name
                const projectName = this.file.basename.replace(/^Project-/, '');
                const tag = 'Project' + projectName.replace(/\s+/g, '').replace(/[^\w\u0400-\u04FF]/g, '');
                
                new NewTaskModal(this.plugin.app, async (name) => {
                    // Pass project name as linkedProject to be stored in frontmatter
                    const newF = await this.plugin.templateManager.createTaskNote(name, [tag], projectName);
                    if (newF) {
                        await this.plugin.templateManager.updateSubtaskTable(this.file, newF);
                        await this.plugin.app.workspace.getLeaf(false).openFile(newF);
                    }
                }).open();
            };
            toolsRow.createEl('button', { cls: 'monitoring-glass-btn tool-btn', text: '🔗 Ресурс' }).onclick = () => new ResourceModal(this.plugin.app, (l, d) => this.plugin.addResourceToNote(this.file, l, d)).open();
            toolsRow.createEl('button', { cls: 'monitoring-glass-btn tool-btn', text: '🏷️ Тег' }).onclick = () => new TagModal(this.plugin.app, (t) => this.plugin.addTagToNote(this.file, t)).open();

            const footer = panelContainer.createDiv({ cls: 'monitoring-footer-row' });
            footer.createEl('button', { cls: 'monitoring-glass-btn footer-btn', text: '📦 Архив' }).onclick = () => this.plugin.moveFileToFolder(this.file, "Архив");
            footer.createEl('button', { cls: 'monitoring-glass-btn footer-btn', text: '🗑️ Корзина' }).onclick = () => this.plugin.moveFileToFolder(this.file, "Корзина");
            footer.createEl('button', { cls: 'monitoring-glass-btn footer-btn delete-btn', text: '❌ Удалить' }).onclick = async () => { if (confirm(`Удалить "${this.file.basename}"?`)) await this.plugin.app.vault.delete(this.file); };

            const tagList = rootContainer.createDiv({ cls: 'monitoring-tag-list' });
            const tags = cache?.frontmatter?.['tags'] || [];
            (Array.isArray(tags) ? tags : [tags]).forEach((tag: string) => {
                const pill = tagList.createSpan({ cls: 'monitoring-tag-pill', text: `#${tag}` });
                pill.onclick = () => { if (confirm(`Удалить #${tag}?`)) this.plugin.removeTagFromNote(this.file, tag); };
            });
        };

        const renderExpanded = () => {
            rootContainer.empty();
            const container = rootContainer.createDiv({ cls: 'monitoring-duration-ui' });
            let viewedMonth = new Date(); viewedMonth.setDate(1);
            let startDate: Date | null = null; let endDate: Date | null = null;
            if (currentDeadline) {
                try {
                    const parts = currentDeadline.split(' to ');
                    if (parts.length === 2) { startDate = new Date(parts[0]); endDate = new Date(parts[1].split(' ')[0]); }
                    else { startDate = new Date(currentDeadline.split(' ')[0]); }
                } catch(e) {}
            }

            const calendarBody = container.createDiv();
            const updateCalendar = () => {
                calendarBody.empty();
                const header = calendarBody.createDiv({ cls: 'monitoring-calendar-header' });
                header.createEl('button', { cls: 'calendar-nav-btn', text: '‹' }).onclick = () => { viewedMonth.setMonth(viewedMonth.getMonth() - 1); updateCalendar(); };
                header.createSpan({ cls: 'calendar-month-label', text: `${["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"][viewedMonth.getMonth()]} ${viewedMonth.getFullYear()}` });
                header.createEl('button', { cls: 'calendar-nav-btn', text: '›' }).onclick = () => { viewedMonth.setMonth(viewedMonth.getMonth() + 1); updateCalendar(); };

                const weekGrid = calendarBody.createDiv({ cls: 'calendar-weekday-labels' });
                ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].forEach(d => weekGrid.createSpan({ text: d }));

                const grid = calendarBody.createDiv({ cls: 'monitoring-calendar-grid' });
                const firstDay = new Date(viewedMonth.getFullYear(), viewedMonth.getMonth(), 1);
                let startOffset = firstDay.getDay(); startOffset = startOffset === 0 ? 6 : startOffset - 1;
                const counter = new Date(firstDay); counter.setDate(firstDay.getDate() - startOffset);
                const todayStr = new Date().toISOString().split('T')[0];

                for (let i = 0; i < 42; i++) {
                    const d = new Date(counter); const dStr = d.toISOString().split('T')[0];
                    const cell = grid.createDiv({ cls: 'calendar-day-cell' });
                    cell.createSpan({ cls: 'calendar-day-num', text: d.getDate().toString() });
                    if (d.getMonth() !== viewedMonth.getMonth()) cell.addClass('is-other-month');
                    if (dStr === todayStr) cell.createDiv({ cls: 'calendar-today-mark' });
                    if ((startDate && dStr === startDate.toISOString().split('T')[0]) || (endDate && dStr === endDate.toISOString().split('T')[0])) cell.addClass('is-selected');
                    if (startDate && endDate && d > startDate && d < endDate) cell.addClass('is-in-range');
                    cell.onclick = () => {
                        if (!startDate || (startDate && endDate)) { startDate = d; endDate = null; }
                        else if (startDate) { if (d > startDate) endDate = d; else { startDate = d; endDate = null; } }
                        updateCalendar();
                    };
                    counter.setDate(counter.getDate() + 1);
                }
                syncInputs();
            };

            const controls = container.createDiv({ cls: 'duration-controls', attr: { style: 'flex-direction: column; align-items: stretch; gap: 10px; display: flex;' } });
            const inputsRow = controls.createDiv({ attr: { style: 'display: flex; gap: 10px; align-items: center; flex-wrap: wrap;' } });
            const sInput = inputsRow.createEl('input', { type: 'date', cls: 'duration-date-input' });
            const toSpan = inputsRow.createSpan({ text: 'до', attr: { style: 'opacity: 0.6;' } });
            const eInput = inputsRow.createEl('input', { type: 'date', cls: 'duration-date-input' });
            const tPicker = inputsRow.createDiv({ cls: 'duration-time-picker' });
            tPicker.createSpan({ text: '⏰', attr: { style: 'margin-right: 5px;' } });
            const tInput = tPicker.createEl('input', { type: 'time' });
            tInput.value = currentDeadline.includes(':') ? currentDeadline.split(' ').pop() || "10:00" : "10:00";

            const syncInputs = () => {
                if (startDate) sInput.value = startDate.toISOString().split('T')[0];
                if (endDate) { eInput.value = endDate.toISOString().split('T')[0]; eInput.style.display = 'block'; toSpan.style.display = 'inline'; }
                else { eInput.style.display = 'none'; toSpan.style.display = 'none'; }
            };

            const bRow = controls.createDiv({ attr: { style: 'display: flex; gap: 10px; justify-content: flex-end;' } });
            bRow.createEl('button', { text: 'Сохранить', cls: 'monitoring-report-btn' }).onclick = async () => {
                let dStr = sInput.value;
                if (eInput.style.display !== 'none' && eInput.value) dStr += ` to ${eInput.value}`;
                dStr += ` ${tInput.value}`;
                await this.plugin.app.fileManager.processFrontMatter(this.file, (fm) => { fm['deadline'] = dStr; });
                renderCollapsed();
            };
            bRow.createEl('button', { text: 'Отмена', cls: 'monitoring-glass-btn' }).onclick = () => renderCollapsed();
            updateCalendar();
        };
        renderCollapsed();
    }
}

class TagModal extends Modal {
    onSubmit: (tag: string) => void; query: string = "";
    constructor(app: any, onSubmit: (tag: string) => void) { super(app); this.onSubmit = onSubmit; }
    onOpen() {
        const { contentEl } = this; contentEl.createEl('h3', { text: 'Добавить тег' });
        const input = new TextComponent(contentEl);
        input.setPlaceholder("Начните вводить название..."); input.inputEl.style.width = "100%"; input.inputEl.focus();
        const suggestionContainer = contentEl.createDiv({ cls: 'tag-suggestions' });
        // @ts-ignore
        const allTags = Object.keys(this.app.metadataCache.getTags()).map(t => t.substring(1));
        const renderSuggestions = (query: string) => {
            suggestionContainer.empty();
            allTags.filter(t => t.toLowerCase().includes(query.toLowerCase())).slice(0, 10).forEach(tag => {
                const item = suggestionContainer.createDiv({ cls: 'tag-suggestion-item', text: tag });
                item.onclick = () => { this.onSubmit(tag); this.close(); };
            });
        };
        input.onChange(val => { this.query = val; renderSuggestions(val); });
        input.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (this.query) { this.onSubmit(this.query); this.close(); } } });
        renderSuggestions("");
    }
    onClose() { this.contentEl.empty(); }
}

class ResourceModal extends Modal {
    link: string = ""; description: string = ""; onSubmit: (link: string, desc: string) => void;
    constructor(app: any, onSubmit: (link: string, desc: string) => void) { super(app); this.onSubmit = onSubmit; }
    onOpen() {
        const { contentEl } = this; contentEl.createEl('h3', { text: 'Добавить новый ресурс' });
        const lInput = new TextComponent(contentEl); lInput.setPlaceholder("http://..."); lInput.onChange(val => this.link = val); lInput.inputEl.style.width = "100%";
        const dInput = new TextComponent(contentEl); dInput.setPlaceholder("Описание..."); dInput.onChange(val => this.description = val); dInput.inputEl.style.width = "100%";
        new ButtonComponent(contentEl.createDiv({ cls: 'modal-button-container' })).setButtonText("Добавить").setCta().onClick(() => { if (this.link) { this.onSubmit(this.link, this.description); this.close(); } });
    }
    onClose() { this.contentEl.empty(); }
}

class NewTaskModal extends Modal {
    onSubmit: (name: string) => void; taskName: string = "";
    constructor(app: any, onSubmit: (name: string) => void) { super(app); this.onSubmit = onSubmit; }
    onOpen() {
        const { contentEl } = this; contentEl.createEl('h3', { text: 'Создать новую задачу' });
        const input = new TextComponent(contentEl); input.setPlaceholder("Название..."); input.inputEl.style.width = "100%";
        input.onChange(val => this.taskName = val);
        requestAnimationFrame(() => { input.inputEl.focus(); });
        new ButtonComponent(contentEl.createDiv({ cls: 'modal-button-container' })).setButtonText("Создать").setCta().onClick(() => { if (this.taskName) { this.onSubmit(this.taskName); this.close(); } });
    }
    onClose() { this.contentEl.empty(); }
}
