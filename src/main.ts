import { Plugin, Notice } from 'obsidian';
import { LLMService } from './llm/LLMService';
import { OutlookService } from './outlook/OutlookService';
import { TemplateManager } from './notes/TemplateManager';
import { MonitoringSettingTab, DEFAULT_SETTINGS, MonitoringPluginSettings } from './settings/SettingsTab';

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
        this.templateManager = new TemplateManager(this.app);

        // Add Ribbon icon for importing mail
        this.addRibbonIcon('mail', 'Импортировать почту', async (evt: MouseEvent) => {
            await this.processEmails();
        });

        // Add Command for Command Palette
        this.addCommand({
            id: 'import-mail',
            name: 'Обновить почту (Import Mail)',
            callback: async () => {
                await this.processEmails();
            }
        });

        this.addSettingTab(new MonitoringSettingTab(this.app, this));
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
                console.warn('Dashboard note not found, will not filter by tracked subjects.');
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
    }
}
