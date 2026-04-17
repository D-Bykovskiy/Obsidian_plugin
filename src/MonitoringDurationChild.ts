import { MarkdownRenderChild, TFile, Notice, Modal, TextComponent, ButtonComponent } from 'obsidian';
import MonitoringPlugin from './main';
import { TeamService } from './team/TeamService';
import { MonitoringPluginSettings, DEFAULT_SETTINGS } from './settings/SettingsTab';
import { TagModal } from './modals/TagModal';
import { ResourceModal } from './modals/ResourceModal';
import { NewTaskModal } from './modals/NewTaskModal';
import { ResponsibleButtonModal } from './modals/ResponsibleButtonModal';
import { EmailTopicModal } from './modals/EmailTopicModal';

export class MonitoringDurationChild extends MarkdownRenderChild {
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
        
        const isSimpleNote = cache?.frontmatter?.['daily'] === true;
        
        const renderCollapsed = () => {
            rootContainer.empty();
            const panelContainer = rootContainer.createDiv({ cls: 'monitoring-controls-panel' });

            if (!isSimpleNote) {
                const row1 = panelContainer.createDiv({ cls: 'monitoring-split-row' });
                
                const dContainer = row1.createDiv({ cls: 'monitoring-third-row' });
                dContainer.createEl('button', {
                    cls: 'monitoring-glass-btn monitoring-btn-full',
                    text: currentDeadline ? `⏳ ${currentDeadline}` : '📅 Срок'
                }).onclick = () => renderExpanded();

                const respContainer = row1.createDiv({ cls: 'monitoring-third-row' });
                const currentResponsible = cache?.frontmatter?.['responsible'] || this.plugin.settings.currentUser || '';
                const respBtn = respContainer.createEl('button', {
                    cls: 'monitoring-glass-btn monitoring-btn-full',
                    text: currentResponsible ? `👤 ${currentResponsible}` : '👤 Ответственный'
                });
                respBtn.onclick = () => new ResponsibleButtonModal(this.plugin.app, this.file, async (name) => {
                    await this.plugin.app.fileManager.processFrontMatter(this.file, (fm) => { fm['responsible'] = name; });
                }).open();

                const emailContainer = row1.createDiv({ cls: 'monitoring-third-row' });
                const trackedEmails = cache?.frontmatter?.['tracked_emails'] || [];
                const emailCount = Array.isArray(trackedEmails) ? trackedEmails.length : 0;
                const emailBtn = emailContainer.createEl('button', {
                    cls: 'monitoring-glass-btn monitoring-btn-full',
                    text: emailCount > 0 ? `📧 ${emailCount} тем` : '📧 Почта'
                });
                emailBtn.onclick = () => new EmailTopicModal(this.plugin.app, this.file, async (topics) => {
                    await this.plugin.app.fileManager.processFrontMatter(this.file, (fm) => {
                        fm['tracked_emails'] = topics;
                    });
                    this.rootContainer.empty();
                    await this.renderUI();
                }, this.plugin).open();

                const pContainer = row1.createDiv({ cls: 'monitoring-third-row' });
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
            } else {
                const row1 = panelContainer.createDiv({ cls: 'monitoring-split-row' });
                
                const dateContainer = row1.createDiv({ cls: 'monitoring-half-row' });
                const createdDate = cache?.frontmatter?.['created'] || '';
                dateContainer.createEl('button', {
                    cls: 'monitoring-glass-btn monitoring-btn-full',
                    text: createdDate ? `📅 ${createdDate}` : '📅 Дата'
                }).onclick = () => {};

                const authorContainer = row1.createDiv({ cls: 'monitoring-half-row' });
                const currentAuthor = cache?.frontmatter?.['author'] || this.plugin.settings.currentUser || '';
                const authorBtn = authorContainer.createEl('button', {
                    cls: 'monitoring-glass-btn monitoring-btn-full',
                    text: currentAuthor ? `✍️ ${currentAuthor}` : '✍️ Автор'
                });
                authorBtn.onclick = () => new ResponsibleButtonModal(this.plugin.app, this.file, async (name) => {
                    await this.plugin.app.fileManager.processFrontMatter(this.file, (fm) => { fm['author'] = name; });
                }).open();
            }

            const toolsRow = panelContainer.createDiv({ cls: 'monitoring-tools-row' });
            toolsRow.createEl('button', { cls: 'monitoring-glass-btn tool-btn', text: '➕ Задачу' }).onclick = () => {
                const projectName = this.file.basename.replace(/^Project-/, '');
                const tag = 'Project' + projectName.replace(/\s+/g, '').replace(/[^\w\u0400-\u04FF]/g, '');
                
                new NewTaskModal(this.plugin.app, async (name) => {
                    const newF = await this.plugin.templateManager.createTaskNote(name, [tag], projectName, this.file);
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
            const today = new Date(); today.setHours(0, 0, 0, 0);
            
            if (currentDeadline) {
                try {
                    const parts = currentDeadline.split(' to ');
                    if (parts.length === 2) { 
                        startDate = new Date(parts[0]); 
                        endDate = new Date(parts[1].split(' ')[0]); 
                    }
                    else { 
                        startDate = new Date(currentDeadline.split(' ')[0]); 
                    }
                } catch(e) {}
            }

            const calendarBody = container.createDiv();
            
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
                if (startDate) {
                    sInput.value = startDate.toISOString().split('T')[0];
                }
                if (endDate) { 
                    eInput.value = endDate.toISOString().split('T')[0]; 
                    eInput.style.display = 'block'; 
                    toSpan.style.display = 'inline'; 
                } else {
                    eInput.style.display = 'none'; 
                    toSpan.style.display = 'none';
                }
            };

            const updateCalendar = () => {
                calendarBody.empty();
                const header = calendarBody.createDiv({ cls: 'monitoring-calendar-header' });
                header.createEl('button', { cls: 'calendar-nav-btn', text: '‹' }).onclick = () => { viewedMonth.setMonth(viewedMonth.getMonth() - 1); updateCalendar(); };
                const monthLabel = header.createSpan({ cls: 'calendar-month-label', text: `${["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"][viewedMonth.getMonth()]} ${viewedMonth.getFullYear()}` });
                header.createEl('button', { cls: 'calendar-nav-btn', text: '›' }).onclick = () => { viewedMonth.setMonth(viewedMonth.getMonth() + 1); updateCalendar(); };
                const modeIndicator = header.createSpan({ 
                    cls: 'calendar-mode-indicator', 
                    text: endDate ? '📅 Период' : '📆 День'
                });

                const weekGrid = calendarBody.createDiv({ cls: 'calendar-weekday-labels' });
                ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].forEach(d => weekGrid.createSpan({ text: d }));

                const daysGrid = calendarBody.createDiv({ cls: 'calendar-days-grid' });
                const firstDay = new Date(viewedMonth.getFullYear(), viewedMonth.getMonth(), 1).getDay();
                const adjustedFirstDay = firstDay === 0 ? 6 : firstDay - 1;
                const daysInMonth = new Date(viewedMonth.getFullYear(), viewedMonth.getMonth() + 1, 0).getDate();
                const todayStr = today.toISOString().split('T')[0];

                for (let i = 0; i < adjustedFirstDay; i++) daysGrid.createDiv({ cls: 'calendar-empty-cell' });
                
                for (let d = 1; d <= daysInMonth; d++) {
                    const cellDate = new Date(viewedMonth.getFullYear(), viewedMonth.getMonth(), d);
                    const dStr = cellDate.toISOString().split('T')[0];
                    const cell = daysGrid.createDiv({ cls: 'calendar-day-cell' });
                    cell.createSpan({ cls: 'calendar-day-num', text: d.toString() });
                    if (dStr === todayStr) cell.createDiv({ cls: 'calendar-today-mark' });
                    
                    const isStart = !!startDate && dStr === startDate.toISOString().split('T')[0];
                    const isEnd = !!endDate && dStr === endDate.toISOString().split('T')[0];
                    const isInRange = !!startDate && !!endDate && cellDate > startDate && cellDate < endDate;
                    
                    if (isStart || isEnd) cell.addClass('is-selected');
                    if (isInRange) cell.addClass('is-in-range');
                    
                    cell.onclick = () => {
                        const clickedDate = new Date(viewedMonth.getFullYear(), viewedMonth.getMonth(), d);
                        clickedDate.setHours(0, 0, 0, 0);
                        
                        if (!startDate) {
                            startDate = clickedDate;
                        } else if (!endDate) {
                            if (clickedDate >= startDate) {
                                endDate = clickedDate;
                            } else {
                                startDate = clickedDate;
                            }
                        } else {
                            startDate = clickedDate;
                            endDate = null;
                        }
                        syncInputs();
                        updateCalendar();
                    };
                }
                syncInputs();
            };

            sInput.onchange = () => {
                if (sInput.value) {
                    startDate = new Date(sInput.value);
                    startDate.setHours(0, 0, 0, 0);
                    endDate = null;
                }
                updateCalendar();
            };
            
            eInput.onchange = () => {
                if (eInput.value) {
                    endDate = new Date(eInput.value);
                    endDate.setHours(0, 0, 0, 0);
                } else {
                    endDate = null;
                }
                updateCalendar();
            };

            const bRow = controls.createDiv({ attr: { style: 'display: flex; gap: 10px; justify-content: flex-end;' } });
            bRow.createEl('button', { text: 'Сохранить', cls: 'monitoring-report-btn' }).onclick = async () => {
                if (!startDate) return;
                let dStr = startDate.toISOString().split('T')[0];
                if (endDate) dStr += ` to ${endDate.toISOString().split('T')[0]}`;
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