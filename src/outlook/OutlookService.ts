import { App, FileSystemAdapter } from 'obsidian';
import { exec } from 'child_process';
import * as path from 'path';
import { MonitoringPluginSettings } from '../settings/SettingsTab';

export interface EmailData {
    entryId: string;
    conversationTopic: string;
    subject: string;
    sender: string;
    receivedDateTime: string;
    bodyPreview: string;
}

export class OutlookService {
    settings: MonitoringPluginSettings;
    app: App;

    constructor(settings: MonitoringPluginSettings, app: App) {
        this.settings = settings;
        this.app = app;
    }

    updateSettings(settings: MonitoringPluginSettings) {
        this.settings = settings;
    }

    async fetchEmails(): Promise<EmailData[]> {
        if (this.settings.useMockData) {
            // Generate deterministic mock emails for testing tracking and threads
            return [
                {
                    entryId: `mock-1-${Date.now()}`,
                    conversationTopic: "Ошибка сервера БД",
                    subject: "Критическая ошибка: сервер базы данных не отвечает",
                    sender: "Система Мониторинга (Zabbix)",
                    receivedDateTime: new Date(Date.now() - 3600000).toISOString(),
                    bodyPreview: "Здравствуйте!\n\nАвтоматический мониторинг зафиксировал недоступность сервера DB-MAIN-01. Время отклика превышает 60000мс. \n\nСлужба была перезапущена, но проблема сохраняется. Требуется вмешательство инженера.\n"
                },
                {
                    entryId: `mock-2-${Date.now()}`,
                    conversationTopic: "Ошибка сервера БД",
                    subject: "Re: Критическая ошибка: сервер базы данных не отвечает",
                    sender: "Иван Иванов (DevOps)",
                    receivedDateTime: new Date().toISOString(),
                    bodyPreview: "Вижу проблему. Зашел на сервер, лог забит запросами от нового микросервиса аналитики. Сейчас временно лимитирую их пул соединений, чтобы освободить ресурсы."
                },
                {
                    entryId: `mock-3-${Date.now()}`,
                    conversationTopic: "Новый релиз frontend",
                    subject: "Релиз 1.5.0 успешно развернут",
                    sender: "CI/CD Pipeline",
                    receivedDateTime: new Date().toISOString(),
                    bodyPreview: "Деплой завершен без ошибок. Все поды поднялись успешно."
                }
            ];
        }

        return new Promise((resolve, reject) => {
            const adapter = this.app.vault.adapter as FileSystemAdapter;
            const basePath = adapter.getBasePath();

            // Path to the python script enclosed in the vault
            // Adjust the plugin name path according to the release
            const pythonScriptPath = path.join(basePath, '.obsidian', 'plugins', 'monitoring-plugin', 'outlook', 'fetch_mail.py');

            // Force UTF-8 on Windows terminal before executing Python
            const pythonCommand = `chcp 65001 >nul && python "${pythonScriptPath}" --folder "${this.settings.mailFolder}"`;

            exec(pythonCommand, { 
                encoding: 'utf-8', 
                env: { ...process.env, PYTHONIOENCODING: 'utf-8' } 
            }, (error, stdout, stderr) => {
                if (error) {
                    console.error("Exec error:", error);
                    return reject(new Error("Failed to execute Outlook python script. Ensure Python is installed and win32com is available."));
                }
                if (stderr) {
                    console.warn("Python stderr:", stderr);
                }

                try {
                    const result = JSON.parse(stdout);
                    resolve(result.value || []);
                } catch (parseError) {
                    console.error("JSON Parse error:", parseError, stdout);
                    reject(new Error("Invalid response format from Python script."));
                }
            });
        });
    }
}
