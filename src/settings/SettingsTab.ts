import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import MonitoringPlugin from '../main';

export interface MonitoringPluginSettings {
    llmApiKey: string;
    llmBaseUrl: string;
    llmModel: string;
    mailFolder: string;
    pollInterval: number;
    scannedEmailIds: string[];
    dashboardNoteName: string;
    useMockData: boolean;
    useMockLLM: boolean;
}

export const DEFAULT_SETTINGS: MonitoringPluginSettings = {
    llmApiKey: '',
    llmBaseUrl: 'https://api.ai.beeline.ru/api/v3',
    llmModel: 'llm-medium-moe-instruct',
    mailFolder: 'Inbox',
    pollInterval: 15,
    scannedEmailIds: [],
    dashboardNoteName: 'Dashboard.md',
    useMockData: false,
    useMockLLM: false
};

export class MonitoringSettingTab extends PluginSettingTab {
    plugin: MonitoringPlugin;

    constructor(app: App, plugin: MonitoringPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();
        containerEl.createEl('h2', { text: 'Monitoring Plugin Settings' });

        new Setting(containerEl)
            .setName('LLM Base URL')
            .setDesc('Base URL for the Corporate LLM API (OpenAI Compatible)')
            .addText(text => text
                .setPlaceholder('https://api.ai.beeline.ru/api/v3')
                .setValue(this.plugin.settings.llmBaseUrl)
                .onChange(async (value) => {
                    this.plugin.settings.llmBaseUrl = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('LLM API Key')
            .setDesc('Bearer token for the corporate LLM API')
            .addText(text => {
                text.setPlaceholder('Enter your API Key')
                    .setValue(this.plugin.settings.llmApiKey)
                    .onChange(async (value: string) => {
                        this.plugin.settings.llmApiKey = value;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.type = 'password';
                return text;
            });

        new Setting(containerEl)
            .setName('LLM Model')
            .setDesc('Model name to use for summarization')
            .addText(text => text
                .setPlaceholder('llm-medium-moe-instruct')
                .setValue(this.plugin.settings.llmModel)
                .onChange(async (value) => {
                    this.plugin.settings.llmModel = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h3', { text: 'Outlook Integration' });

        new Setting(containerEl)
            .setName('Outlook Folder Name')
            .setDesc('The folder to check for new incident emails (e.g. Inbox, Alerts)')
            .addText(text => text
                .setPlaceholder('Inbox')
                .setValue(this.plugin.settings.mailFolder)
                .onChange(async (value) => {
                    this.plugin.settings.mailFolder = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Dashboard Note Name')
            .setDesc('Name of the note containing tracked subjects (e.g. Dashboard.md)')
            .addText(text => text
                .setPlaceholder('Dashboard.md')
                .setValue(this.plugin.settings.dashboardNoteName)
                .onChange(async (value) => {
                    this.plugin.settings.dashboardNoteName = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Clear Scanned Emails Cache')
            .setDesc('Reset the list of already processed emails so they can be scanned again.')
            .addButton(button => button
                .setButtonText('Clear Cache')
                .onClick(async () => {
                    this.plugin.settings.scannedEmailIds = [];
                    await this.plugin.saveSettings();
                    new Notice('Scanned emails cache cleared!');
                }));

        containerEl.createEl('h3', { text: 'Development / Testing' });

        new Setting(containerEl)
            .setName('Use Mock Email Data')
            .setDesc('Inject fake Outlook emails for local testing without Outlook installed.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.useMockData)
                .onChange(async (value) => {
                    this.plugin.settings.useMockData = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Use Mock LLM')
            .setDesc('Return dummy text instead of calling the corporate LLM.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.useMockLLM)
                .onChange(async (value) => {
                    this.plugin.settings.useMockLLM = value;
                    await this.plugin.saveSettings();
                }));
    }
}
