import { requestUrl, RequestUrlParam } from 'obsidian';
import { MonitoringPluginSettings } from '../settings/SettingsTab';

export class LLMService {
    settings: MonitoringPluginSettings;

    constructor(settings: MonitoringPluginSettings) {
        this.settings = settings;
    }

    updateSettings(settings: MonitoringPluginSettings) {
        this.settings = settings;
    }

    async summarizeIncident(content: string): Promise<string> {
        if (this.settings.useMockLLM) {
            return `**[MOCK] Описание инцидента:**\nПроизошла тестовая ошибка. Системы работают в штатном режиме.\n\n**Задачи:**\n- Проверить логи сервера\n- Сообщить дежурному администратору\n\n*Оригинальный текст:* ${content.slice(0, 50)}...`;
        }

        if (!this.settings.llmApiKey || !this.settings.llmBaseUrl) {
            throw new Error('LLM API Not Configured in Settings!');
        }

        let baseUrl = this.settings.llmBaseUrl.replace(/\/$/, '');
        
        let endpoint = baseUrl;
        if (!baseUrl.endsWith('/chat/completions')) {
            if (baseUrl.match(/\/(v\d+|api\/v\d+)$/)) {
                endpoint = `${baseUrl}/chat/completions`;
            } else {
                endpoint = `${baseUrl}/v1/chat/completions`;
            }
        }

        const requestData = {
            model: this.settings.llmModel || 'llm-medium-moe-instruct',
            messages: [
                { role: 'system', content: 'Ты корпоративный ИИ-ассистент для мониторинга инцидентов. Отвечай всегда на русском языке.' },
                { role: 'user', content: `Сделай саммари (краткую выжимку) следующего инцидента и выдели задачи:\n\n${content}` }
            ],
            stream: false,
            temperature: 0.7,
            max_tokens: 1500
        };

        const requestParams: RequestUrlParam = {
            url: endpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.settings.llmApiKey}`
            },
            body: JSON.stringify(requestData)
        };

        try {
            const response = await requestUrl(requestParams);
            if (response.status >= 200 && response.status < 300) {
                const json = response.json;
                return json.choices?.[0]?.message?.content || 'No summary generated.';
            } else {
                throw new Error(`LLM Error ${response.status}: ${response.text}`);
            }
        } catch (error) {
            console.error('LLM API Error:', error);
            throw new Error(`Failed to contact LLM: ${error.message}`);
        }
    }

    async updateIncidentSummary(oldSummary: string, newContent: string): Promise<string> {
        if (this.settings.useMockLLM) {
            return `**[MOCK] Обновленная информация по инциденту:**\n\n${oldSummary}\n\n**Новое обновление:**\nПолучены новые данные: ${newContent.slice(0, 50)}... Требуется анализ.`;
        }

        if (!this.settings.llmApiKey || !this.settings.llmBaseUrl) {
            throw new Error('LLM API Not Configured in Settings!');
        }

        let baseUrl = this.settings.llmBaseUrl.replace(/\/$/, '');
        let endpoint = baseUrl;
        if (!baseUrl.endsWith('/chat/completions')) {
            if (baseUrl.match(/\/(v\d+|api\/v\d+)$/)) {
                endpoint = `${baseUrl}/chat/completions`;
            } else {
                endpoint = `${baseUrl}/v1/chat/completions`;
            }
        }

        const requestData = {
            model: this.settings.llmModel || 'llm-medium-moe-instruct',
            messages: [
                { role: 'system', content: 'Ты корпоративный ИИ-ассистент для мониторинга инцидентов. Отвечай всегда на русском языке.' },
                { role: 'user', content: `Вот текущее саммари инцидента:\n${oldSummary}\n\nПоступило новое сообщение по этой проблеме:\n${newContent}\n\nПожалуйста, обнови саммари инцидента с учетом новой информации (пиши на русском языке).` }
            ],
            stream: false,
            temperature: 0.7,
            max_tokens: 1500
        };

        const requestParams: RequestUrlParam = {
            url: endpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.settings.llmApiKey}`
            },
            body: JSON.stringify(requestData)
        };

        try {
            const response = await requestUrl(requestParams);
            if (response.status >= 200 && response.status < 300) {
                const json = response.json;
                return json.choices?.[0]?.message?.content || 'No summary generated.';
            } else {
                throw new Error(`LLM Error ${response.status}: ${response.text}`);
            }
        } catch (error) {
            console.error('LLM API Error:', error);
            throw new Error(`Failed to contact LLM: ${error.message}`);
        }
    }
}
