import { Plugin, Notice, TFile, Modal, TextComponent, ButtonComponent } from 'obsidian';
import { LLMService } from './llm/LLMService';
import { OutlookService } from './outlook/OutlookService';
import { TemplateManager } from './notes/TemplateManager';
import { MonitoringSettingTab, DEFAULT_SETTINGS, MonitoringPluginSettings } from './settings/SettingsTab';
import { ChatView, CHAT_VIEW_TYPE } from './chat/ChatView';
import { MainPageView, MAIN_PAGE_VIEW_TYPE } from './main-page/MainPageView';

export default class MonitoringPlugin extends Plugin {
    settings: MonitoringPluginSettings;
    llmService: LLMService;
    outlookService: OutlookService;
    templateManager: TemplateManager;

    async onload() {
        await this.loadSettings();

        // Initialize the sub-modules (skills)
        this.llmService = new LLMService(this.settings);
        this.outlookService = new OutlookService(this.settings, this.app);
        this.templateManager = new TemplateManager(this.app, this.settings);

        // Register Chat View
        this.registerView(
            CHAT_VIEW_TYPE,
            (leaf) => new ChatView(leaf, this.llmService)
        );

        this.registerView(
            MAIN_PAGE_VIEW_TYPE,
            (leaf) => new MainPageView(leaf, this)
        );

        // Add Ribbon icon for importing mail
        this.addRibbonIcon('mail', 'Импортировать почту', async (evt: MouseEvent) => {
            await this.processEmails();
        });

        // Add Ribbon icon for Chat View
        this.addRibbonIcon('message-square', 'Корпоративный ИИ Чат', async (evt: MouseEvent) => {
            await this.activateChatView();
        });

        // Add Ribbon icon for Main Dashboard View
        this.addRibbonIcon('layout-dashboard', 'Главная панель проектов', async (evt: MouseEvent) => {
            await this.activateMainPageView();
        });

        // Add Command for Command Palette
        this.addCommand({
            id: 'import-mail',
            name: 'Обновить почту (Import Mail)',
            callback: async () => {
                await this.processEmails();
            }
        });

        // Add Command to open chat
        this.addCommand({
            id: 'open-ai-chat',
            name: 'Открыть корпоративный чат (Open AI Chat)',
            callback: async () => {
                await this.activateChatView();
            }
        });

        // Register custom markdown block for dashboard UI
        this.registerMarkdownCodeBlockProcessor("monitoring-ui", (source, el, ctx) => {
            const container = el.createDiv({ cls: 'monitoring-dashboard-ui' });
            
            const title = container.createEl('h4', { text: 'Управление отслеживанием' });
            const wrapper = container.createDiv({ cls: 'monitoring-input-wrapper' });
            
            const input = wrapper.createEl('input', { 
                type: 'text', 
                placeholder: 'Введите ключевые слова темы...',
                cls: 'monitoring-topic-input'
            });
            const btn = wrapper.createEl('button', { 
                text: 'Добавить',
                cls: 'monitoring-add-btn'
            });
            
            btn.onclick = async () => {
                const topic = input.value.trim();
                if (!topic) return;
                
                const dashboardFile = this.app.vault.getAbstractFileByPath(this.settings.dashboardNoteName) as import('obsidian').TFile;
                if (dashboardFile) {
                    await this.app.fileManager.processFrontMatter(dashboardFile, (frontmatter) => {
                        if (!frontmatter['tracked_subjects']) {
                            frontmatter['tracked_subjects'] = [];
                        }
                        if (!Array.isArray(frontmatter['tracked_subjects'])) {
                            frontmatter['tracked_subjects'] = [frontmatter['tracked_subjects']];
                        }
                        if (!frontmatter['tracked_subjects'].includes(topic)) {
                            frontmatter['tracked_subjects'].push(topic);
                        }
                    });
                    new Notice(`Тема "${topic}" добавлена!`);
                    input.value = '';
                } else {
                    new Notice('Файл дашборда не найден!');
                }
            };
        });

        // Register duration/deadline picker
        this.registerMarkdownCodeBlockProcessor("monitoring-duration", async (source, el, ctx) => {
            const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
            if (!(file instanceof TFile)) return;

            const rootContainer = el.createDiv({ cls: 'monitoring-duration-wrapper' });

            const renderUI = async () => {
                rootContainer.empty();
                
                const getLatestCache = () => this.app.metadataCache.getFileCache(file);
                let cache = getLatestCache();
                let currentDeadline = cache?.frontmatter?.['deadline'] || "";
                
                const renderCollapsed = () => {
                    const panelContainer = rootContainer.createDiv({ cls: 'monitoring-controls-panel' });
                    
                    // Row 1: Deadline and Priority (Split)
                    const row1 = panelContainer.createDiv({ cls: 'monitoring-split-row' });
                    
                    // Deadline Side
                    const deadlineContainer = row1.createDiv({ cls: 'monitoring-half-row' });
                    const durationBtn = deadlineContainer.createEl('button', {
                        cls: 'monitoring-glass-btn monitoring-btn-full',
                        text: currentDeadline ? `⏳ ${currentDeadline}` : '📅 Срок'
                    });
                    durationBtn.onclick = () => renderExpanded();

                    // Priority Side
                    const priorityContainer = row1.createDiv({ cls: 'monitoring-half-row' });
                    let isPriorityExpanded = false;

                    const renderPriorityUI = () => {
                        priorityContainer.empty();
                        const priority = parseInt(cache?.frontmatter?.['priority']) || 3;

                        if (!isPriorityExpanded) {
                            const toggleBtn = priorityContainer.createEl('button', {
                                cls: 'monitoring-glass-btn priority-toggle-btn monitoring-btn-full'
                            });
                            toggleBtn.createSpan({ text: '⭐', attr: { style: 'margin-right: 4px;' } });
                            toggleBtn.createSpan({ 
                                text: priority.toString(), 
                                cls: `priority-badge priority-${priority}` 
                            });
                            
                            toggleBtn.onclick = () => {
                                isPriorityExpanded = true;
                                renderPriorityUI();
                            };
                        } else {
                            const wrapper = priorityContainer.createDiv({ cls: 'priority-slider-mini-wrapper' });
                            const slider = wrapper.createEl('input', {
                                type: 'range',
                                cls: 'priority-slider',
                                attr: { min: '1', max: '5', value: priority.toString() }
                            });

                            slider.onchange = async () => {
                                const val = parseInt(slider.value);
                                await this.app.fileManager.processFrontMatter(file, (fm) => {
                                    fm['priority'] = val;
                                });
                                new Notice(`Приоритет: ${val}`);
                                isPriorityExpanded = false;
                                renderPriorityUI();
                            };
                            
                            // Close on blur or click outside would be nice but simple close btn for now
                            const closeBtn = wrapper.createEl('button', { cls: 'mini-close-btn', text: '×' });
                            closeBtn.onclick = () => { isPriorityExpanded = false; renderPriorityUI(); };
                        }
                    };
                    renderPriorityUI();

                    // Row 2: Status Buttons (Progress)
                    const statusRow = panelContainer.createDiv({ cls: 'monitoring-status-row segmented-control' });
                    const statuses = [
                        { label: 'План', value: 'To Do', icon: '🎯' },
                        { label: 'В работе', value: 'In Progress', icon: '⚡' },
                        { label: 'Готово', value: 'Done', icon: '✅' }
                    ];

                    statuses.forEach(status => {
                        const sBtn = statusRow.createEl('button', {
                            cls: 'monitoring-glass-btn status-segment-btn',
                            text: `${status.icon} ${status.label}`
                        });
                        
                        if (cache?.frontmatter?.['status'] === status.value) {
                            sBtn.addClass('is-active-status');
                        }

                        sBtn.onclick = async () => {
                            statusRow.querySelectorAll('.monitoring-glass-btn').forEach(b => b.removeClass('is-active-status'));
                            sBtn.addClass('is-active-status');
                            await this.app.fileManager.processFrontMatter(file, (fm) => {
                                fm['status'] = status.value;
                            });
                            new Notice(`Статус: ${status.label}`);
                        };
                    });

                    // Row 3: Creation Tools (+Task, +Resource, +Tag)
                    const toolsRow = panelContainer.createDiv({ cls: 'monitoring-tools-row' });
                    
                    const addTaskBtn = toolsRow.createEl('button', {
                        cls: 'monitoring-glass-btn tool-btn',
                        text: '➕ Задачу'
                    });
                    addTaskBtn.onclick = () => {
                        const currentNoteName = file.basename;
                        const tagFromName = currentNoteName.replace(/\s+/g, '').replace(/[^\w\u0400-\u04FF]/g, '');
                        new NewTaskModal(this.app, async (taskName) => {
                            const newFile = await this.templateManager.createTaskNote(taskName, [tagFromName]);
                            await this.app.workspace.getLeaf(false).openFile(newFile);
                        }).open();
                    };

                    const resourceBtn = toolsRow.createEl('button', {
                        cls: 'monitoring-glass-btn tool-btn',
                        text: '🔗 Ресурс'
                    });
                    resourceBtn.onclick = () => {
                        new ResourceModal(this.app, async (link, desc) => {
                            // @ts-ignore
                            await this.addResourceToNote(file, link, desc);
                        }).open();
                    };

                    const tagBtn = toolsRow.createEl('button', {
                        cls: 'monitoring-glass-btn tool-btn',
                        text: '🏷️ Тег'
                    });
                    tagBtn.onclick = () => {
                        new TagModal(this.app, async (tag) => {
                            await this.addTagToNote(file, tag);
                        }).open();
                    };

                    // Row 4: Management Buttons (Archive, Trash, Delete) - The Footer
                    const managementRow = panelContainer.createDiv({ cls: 'monitoring-footer-row' });
                    
                    const archiveBtn = managementRow.createEl('button', {
                        cls: 'footer-btn',
                        text: '📦 Архив'
                    });
                    archiveBtn.onclick = () => this.moveFileToFolder(file, "Архив");

                    const trashBtn = managementRow.createEl('button', {
                        cls: 'footer-btn',
                        text: '🗑️ Корзина'
                    });
                    trashBtn.onclick = () => this.moveFileToFolder(file, "Корзина");

                    const deleteBtn = managementRow.createEl('button', {
                        cls: 'footer-btn delete-btn',
                        text: '❌ Удалить'
                    });
                    deleteBtn.onclick = async () => {
                        if (confirm(`Удалить заметку "${file.basename}"?`)) {
                            await this.app.vault.delete(file);
                        }
                    };

                    // Tag Pills Display (Outside/Below Panel)
                    const tagList = rootContainer.createDiv({ cls: 'monitoring-tag-list' });
                    const currentTags = cache?.frontmatter?.['tags'] || [];
                    const tagsArray = Array.isArray(currentTags) ? currentTags : (typeof currentTags === 'string' ? currentTags.split(',').map(t => t.trim()) : []);
                    
                    tagsArray.forEach(tag => {
                        const tagPill = tagList.createSpan({ 
                            cls: 'monitoring-tag-pill', 
                            text: `#${tag}` 
                        });
                        tagPill.onclick = async () => {
                            if (confirm(`Удалить тег #${tag}?`)) {
                                await this.removeTagFromNote(file, tag);
                            }
                        };
                    });
                };

                const renderExpanded = () => {
                    rootContainer.empty();
                    const container = rootContainer.createDiv({ cls: 'monitoring-duration-ui' });
                    
                    // Month state
                    let viewedMonth = new Date();
                    viewedMonth.setDate(1);

                    // Selection state
                    let startDate: Date | null = null;
                    let endDate: Date | null = null;

                    // Parse existing deadline if possible
                    if (currentDeadline) {
                        try {
                            const parts = currentDeadline.split(' to ');
                            if (parts.length === 2) {
                                startDate = new Date(parts[0]);
                                endDate = new Date(parts[1].split(' ')[0]);
                            } else {
                                startDate = new Date(currentDeadline.split(' ')[0]);
                            }
                        } catch(e) {}
                    }

                    const calendarBody = container.createDiv();
                    
                    let updateCalendar = () => {
                        calendarBody.empty();
                        
                        // Header: Month Nav
                        const header = calendarBody.createDiv({ cls: 'monitoring-calendar-header' });
                        const prevBtn = header.createEl('button', { cls: 'calendar-nav-btn', text: '‹' });
                        const monthLabel = header.createSpan({ cls: 'calendar-month-label' });
                        const nextBtn = header.createEl('button', { cls: 'calendar-nav-btn', text: '›' });
                        
                        const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
                        monthLabel.textContent = `${monthNames[viewedMonth.getMonth()]} ${viewedMonth.getFullYear()}`;

                        prevBtn.onclick = () => { viewedMonth.setMonth(viewedMonth.getMonth() - 1); updateCalendar(); };
                        nextBtn.onclick = () => { viewedMonth.setMonth(viewedMonth.getMonth() + 1); updateCalendar(); };

                        // Weekdays labels
                        const weekGrid = calendarBody.createDiv({ cls: 'calendar-weekday-labels' });
                        ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].forEach(d => weekGrid.createSpan({ text: d }));

                        const grid = calendarBody.createDiv({ cls: 'monitoring-calendar-grid' });
                        
                        // Calculate days
                        const firstDay = new Date(viewedMonth.getFullYear(), viewedMonth.getMonth(), 1);
                        let startOffset = firstDay.getDay(); // 0 is Sun
                        startOffset = startOffset === 0 ? 6 : startOffset - 1; // 0 is Mon

                        const startDateCounter = new Date(firstDay);
                        startDateCounter.setDate(firstDay.getDate() - startOffset);

                        const todayStr = new Date().toISOString().split('T')[0];

                        for (let i = 0; i < 42; i++) {
                            const d = new Date(startDateCounter);
                            const dateStr = d.toISOString().split('T')[0];
                            
                            const cell = grid.createDiv({ cls: 'calendar-day-cell' });
                            cell.createSpan({ cls: 'calendar-day-num', text: d.getDate().toString() });
                            
                            if (d.getMonth() !== viewedMonth.getMonth()) cell.addClass('is-other-month');
                            if (dateStr === todayStr) cell.createDiv({ cls: 'calendar-today-mark' });

                            const isSelected = (startDate && dateStr === startDate.toISOString().split('T')[0]) || 
                                             (endDate && dateStr === endDate.toISOString().split('T')[0]);
                            if (isSelected) cell.addClass('is-selected');

                            if (startDate && endDate && d > startDate && d < endDate) cell.addClass('is-in-range');

                            cell.onclick = () => {
                                if (!startDate || (startDate && endDate)) {
                                    startDate = d; endDate = null;
                                } else if (startDate) {
                                    if (d > startDate) endDate = d;
                                    else { startDate = d; endDate = null; }
                                }
                                updateCalendar();
                            };
                            startDateCounter.setDate(startDateCounter.getDate() + 1);
                        }
                    };

                    updateCalendar();

                    const controls = container.createDiv({ cls: 'duration-controls', attr: { style: 'flex-direction: column; align-items: stretch; gap: 10px;' } });
                    
                    const inputsRow = controls.createDiv({ attr: { style: 'display: flex; gap: 10px; align-items: center; flex-wrap: wrap;' } });
                    
                    const startDateInput = inputsRow.createEl('input', { type: 'date', cls: 'duration-date-input' });
                    const toSpan = inputsRow.createSpan({ text: 'до', attr: { style: 'opacity: 0.6; display: none;' } });
                    const endDateInput = inputsRow.createEl('input', { type: 'date', cls: 'duration-date-input', attr: { style: 'display: none;' } });
                    
                    const timePicker = inputsRow.createDiv({ cls: 'duration-time-picker' });
                    timePicker.createSpan({ text: '⏰', attr: { style: 'margin-right: 5px;' } });
                    const timeInput = timePicker.createEl('input', { type: 'time' });
                    timeInput.value = currentDeadline.includes(':') ? currentDeadline.split(' ').pop() || "10:00" : "10:00";

                    const syncInputs = () => {
                        if (startDate) startDateInput.value = startDate.toISOString().split('T')[0];
                        if (endDate) {
                            endDateInput.value = endDate.toISOString().split('T')[0];
                            endDateInput.style.display = 'block';
                            toSpan.style.display = 'inline';
                        } else {
                            endDateInput.style.display = 'none';
                            toSpan.style.display = 'none';
                        }
                    };
                    syncInputs();

                    // Update calendar when manual inputs change
                    startDateInput.onchange = () => { startDate = new Date(startDateInput.value); updateCalendar(); };
                    endDateInput.onchange = () => { endDate = new Date(endDateInput.value); updateCalendar(); };

                    const buttonsRow = controls.createDiv({ attr: { style: 'display: flex; gap: 10px; justify-content: flex-end;' } });
                    
                    const saveBtn = buttonsRow.createEl('button', { text: 'Сохранить', cls: 'monitoring-report-btn' });
                    saveBtn.onclick = async () => {
                        // Use values from inputs to be safe
                        const sDate = startDateInput.value;
                        const eDate = endDateInput.style.display !== 'none' ? endDateInput.value : null;
                        
                        let deadlineStr = "";
                        if (sDate && eDate) {
                            deadlineStr = `${sDate} to ${eDate} ${timeInput.value}`;
                        } else if (sDate) {
                            deadlineStr = `${sDate} ${timeInput.value}`;
                        }

                        currentDeadline = deadlineStr; 
                        await this.app.fileManager.processFrontMatter(file, (fm) => {
                            fm['deadline'] = deadlineStr;
                        });
                        
                        new Notice(`Сохранено: ${deadlineStr}`);
                        rootContainer.empty();
                        renderCollapsed();
                    };

                    const cancelBtn = buttonsRow.createEl('button', { text: 'Отмена', cls: 'monitoring-glass-btn' });
                    cancelBtn.onclick = () => { rootContainer.empty(); renderCollapsed(); };

                    // Override updateCalendar to also sync inputs
                    const originalUpdateCalendar = updateCalendar;
                    updateCalendar = () => {
                        originalUpdateCalendar();
                        syncInputs();
                    };
                };

                renderCollapsed();
            };

            await renderUI();
            
            // Auto-refresh when metadata changes (external update support)
            this.registerEvent(this.app.metadataCache.on('changed', (f) => {
                if (f.path === file.path) renderUI();
            }));
        });

        this.addSettingTab(new MonitoringSettingTab(this.app, this));
    }

    async activateChatView() {
        const { workspace } = this.app;

        let leaf: import('obsidian').WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(CHAT_VIEW_TYPE);

        if (leaves.length > 0) {
            // A leaf with our view already exists, use that
            leaf = leaves[0];
        } else {
            // Our view could not be found in the workspace, create a new leaf
            // in the right sidebar for it
            leaf = workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
            }
        }

        // "Reveal" the leaf in case it is in a collapsed sidebar
        if (leaf) {
             workspace.revealLeaf(leaf);
        }
    }

    async activateMainPageView() {
        const { workspace } = this.app;

        let leaf = null;
        const leaves = workspace.getLeavesOfType(MAIN_PAGE_VIEW_TYPE);

        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            // Create a new leaf in the main editing area
            leaf = workspace.getLeaf(true);
            await leaf.setViewState({ type: MAIN_PAGE_VIEW_TYPE, active: true });
        }

        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }

    async processEmails() {
        new Notice('Запуск сканирования почты...');
        try {
            const allEmails = await this.outlookService.fetchEmails();
            
            // Reverse so we process oldest to newest within our batch
            allEmails.reverse(); 

            // Filter new emails
            let newEmails = allEmails.filter(e => !this.settings.scannedEmailIds.includes(e.entryId));

            if (newEmails.length === 0) {
                new Notice('Нет новых писем. Берем последние 10 для анализа...');
                newEmails = allEmails.slice(Math.max(allEmails.length - 10, 0));
            }

            if (newEmails.length === 0) {
                new Notice('Папка пуста.');
                return;
            }

            // Get tracked subjects from dashboard
            const dashboardFn = this.settings.dashboardNoteName;
            let trackedSubjects: string[] = [];
            const dashboardFile = this.app.vault.getAbstractFileByPath(dashboardFn) as import('obsidian').TFile;
            
            if (dashboardFile) {
                const cache = this.app.metadataCache.getFileCache(dashboardFile);
                if (cache?.frontmatter && Array.isArray(cache.frontmatter['tracked_subjects'])) {
                    trackedSubjects = cache.frontmatter['tracked_subjects'].map((s: string) => s.toLowerCase());
                }
            } else {
                new Notice(`Дашборд "${dashboardFn}" не найден. Создаю новый и сканирую 10 последних писем...`);
                const content = `---\n` +
                                `tracked_subjects:\n` +
                                `  - "Пример инцидента"\n` +
                                `---\n` +
                                `# Информационная панель мониторинга\n\n` +
                                `> [!tip] Как отслеживать новые темы?\n` +
                                `> Вы можете вписать их руками в \`tracked_subjects\` вверху, либо использовать форму ниже.\n\n` +
                                `\`\`\`monitoring-ui\n\`\`\`\n`;
                await this.app.vault.create(dashboardFn, content);
                
                // Since this is likely a first setup or a reset, force taking last 10
                newEmails = allEmails.slice(Math.max(allEmails.length - 10, 0));
            }

            let processedCount = 0;

            for (const email of newEmails) {
                // If trackedSubjects defined and not empty, check if topic matches
                if (trackedSubjects.length > 0) {
                    const topicLower = email.conversationTopic.toLowerCase();
                    const isTracked = trackedSubjects.some(ts => topicLower.includes(ts));
                    if (!isTracked) continue; // skip if we have a tracking list and it's not tracked
                }

                // Try to find an existing note
                const existingNote = await this.templateManager.getIncidentNoteByTopic(email.conversationTopic);

                if (existingNote) {
                    // Update rolling summary
                    new Notice(`Обновляем инцидент: ${email.conversationTopic}`);
                    const content = await this.templateManager.readNoteContent(existingNote);
                    const summaryRegex = /## Текущее саммари инцидента\n([\s\S]*?)\n---/m;
                    const match = content.match(summaryRegex);
                    const oldSummary = match ? match[1].trim() : 'Логов нет.';

                    const combinedSummary = await this.llmService.updateIncidentSummary(oldSummary, email.bodyPreview);
                    await this.templateManager.updateIncidentNote(existingNote, email, combinedSummary);
                } else {
                    // Create new incident
                    new Notice(`Новый инцидент: ${email.conversationTopic}`);
                    const summary = await this.llmService.summarizeIncident(email.bodyPreview);
                    await this.templateManager.createIncidentNote(email, summary);
                }

                processedCount++;
                
                // Track as scanned
                if (!this.settings.scannedEmailIds.includes(email.entryId)) {
                    this.settings.scannedEmailIds.push(email.entryId);
                }
            }

            await this.saveSettings();
            
            if (processedCount === 0) {
                 new Notice('Нет писем по отслеживаемым темам.');
            } else {
                 new Notice(`Готово! Обработано писем: ${processedCount}`);
            }

        } catch (error) {
            console.error(error);
            new Notice('Ошибка при импорте: ' + error.message);
        }
    }

    onunload() {
        // Cleanup when plugin is disabled
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // Propagate settings changes to services
        this.llmService.updateSettings(this.settings);
        this.outlookService.updateSettings(this.settings);
        this.templateManager.updateSettings(this.settings);
    }

    async addResourceToNote(file: TFile, link: string, description: string) {
        const content = await this.app.vault.read(file);
        const resourceSectionHeader = "## 🔗 База материалов и ресурсов";
        
        let newContent = content;
        const normalizedLink = link.startsWith('http') ? `[Открыть](${link})` : `[Открыть](file:///${link.replace(/\\/g, '/')})`;
        const finalDesc = description || link;
        const newRow = `| ${normalizedLink} | ${finalDesc} |\n`;

        if (content.includes(resourceSectionHeader)) {
            // Append to existing table
            newContent = content.replace(resourceSectionHeader, `${resourceSectionHeader}\n${newRow}`);
            // Note: simple replace might prepend, let's be more precise if needed, 
            // but for now appending after header is fine.
        } else {
            // Create new section at the end
            newContent += `\n\n${resourceSectionHeader}\n| Ресурс | Описание |\n| --- | --- |\n${newRow}`;
        }

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
            let folder = this.app.vault.getAbstractFileByPath(folderName);
            if (!folder) {
                await this.app.vault.createFolder(folderName);
            }
            const newPath = `${folderName}/${file.name}`;
            
            // Check if file already exists in target
            const existingFile = this.app.vault.getAbstractFileByPath(newPath);
            if (existingFile) {
                new Notice(`Файл с таким именем уже есть в "${folderName}"`);
                return;
            }

            await this.app.fileManager.renameFile(file, newPath);
            new Notice(`Заметка перемещена в "${folderName}"`);
        } catch (e) {
            console.error(e);
            new Notice(`Ошибка при перемещении: ${e.message}`);
        }
    }
}

class TagModal extends Modal {
    onSubmit: (tag: string) => void;
    query: string = "";

    constructor(app: any, onSubmit: (tag: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: 'Добавить тег' });

        const input = new TextComponent(contentEl);
        input.setPlaceholder("Начните вводить название...");
        input.inputEl.style.width = "100%";
        input.inputEl.style.marginBottom = "15px";
        input.inputEl.focus();

        const suggestionContainer = contentEl.createDiv({ cls: 'tag-suggestions' });
        
        // @ts-ignore
        const allTags = Object.keys(this.app.metadataCache.getTags()).map(t => t.substring(1));

        const renderSuggestions = (query: string) => {
            suggestionContainer.empty();
            const filtered = allTags.filter(t => t.toLowerCase().includes(query.toLowerCase())).slice(0, 10);
            
            filtered.forEach(tag => {
                const item = suggestionContainer.createDiv({ cls: 'tag-suggestion-item', text: tag });
                item.onclick = () => {
                    this.onSubmit(tag);
                    this.close();
                };
            });
        };

        input.onChange(val => {
            this.query = val;
            renderSuggestions(val);
        });

        input.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (this.query) {
                    this.onSubmit(this.query);
                    this.close();
                }
            }
        });

        renderSuggestions("");
    }

    onClose() {
        this.contentEl.empty();
    }
}

class ResourceModal extends Modal {
    link: string = "";
    description: string = "";
    onSubmit: (link: string, desc: string) => void;

    constructor(app: any, onSubmit: (link: string, desc: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: 'Добавить новый ресурс' });

        contentEl.createEl('label', { text: 'Ссылка или путь к файлу:' });
        const linkInput = new TextComponent(contentEl);
        linkInput.setPlaceholder("http://... или C:\\path\\to\\file");
        linkInput.onChange(val => this.link = val);
        linkInput.inputEl.style.width = "100%";
        linkInput.inputEl.style.marginBottom = "15px";

        contentEl.createEl('label', { text: 'Описание (необязательно):' });
        const descInput = new TextComponent(contentEl);
        descInput.setPlaceholder("Название ресурса...");
        descInput.onChange(val => this.description = val);
        descInput.inputEl.style.width = "100%";
        descInput.inputEl.style.marginBottom = "20px";

        const btnContainer = contentEl.createDiv({ cls: 'modal-button-container', attr: { style: 'display: flex; gap: 10px; justify-content: flex-end;' } });
        
        new ButtonComponent(btnContainer)
            .setButtonText("Добавить")
            .setCta()
            .onClick(() => {
                if (this.link) {
                    this.onSubmit(this.link, this.description);
                    this.close();
                } else {
                    new Notice("Укажите ссылку или путь");
                }
            });

        linkInput.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.description = descInput.getValue();
                if (this.link) {
                    this.onSubmit(this.link, this.description);
                    this.close();
                }
            }
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}

class NewTaskModal extends Modal {
    onSubmit: (name: string) => void;
    taskName: string = "";

    constructor(app: any, onSubmit: (name: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: 'Создать новую задачу' });

        const input = new TextComponent(contentEl);
        input.setPlaceholder("Название задачи...");
        input.inputEl.style.width = "100%";
        input.inputEl.style.marginBottom = "20px";
        input.inputEl.focus();

        input.onChange(val => this.taskName = val);

        const btnContainer = contentEl.createDiv({ cls: 'modal-button-container', attr: { style: 'display: flex; gap: 10px; justify-content: flex-end;' } });
        
        new ButtonComponent(btnContainer)
            .setButtonText("Создать")
            .setCta()
            .onClick(() => {
                if (this.taskName) {
                    this.onSubmit(this.taskName);
                    this.close();
                } else {
                    new Notice("Введите название задачи");
                }
            });

        input.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (this.taskName) {
                    this.onSubmit(this.taskName);
                    this.close();
                }
            }
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}
