import { App, TFile, TFolder } from 'obsidian';
import { EmailData } from '../outlook/OutlookService';
import { MonitoringPluginSettings } from '../settings/SettingsTab';

export class TemplateManager {
    app: App;
    settings: MonitoringPluginSettings;

    constructor(app: App, settings: MonitoringPluginSettings) {
        this.app = app;
        this.settings = settings;
    }

    updateSettings(settings: MonitoringPluginSettings) {
        this.settings = settings;
    }

    async getIncidentNoteByTopic(topic: string): Promise<TFile | null> {
        // Find if a note with this conversation topic already exists
        const files = this.app.vault.getMarkdownFiles();
        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (cache?.frontmatter && cache.frontmatter['conversation_topic'] === topic) {
                return file;
            }
        }
        return null;
    }

    async createIncidentNote(email: EmailData, summary: string): Promise<TFile> {
        const vault = this.app.vault;
        const topic = email.conversationTopic || email.subject || 'Unknown';
        const safeTitle = topic.replace(/[\\/:"*?<>|]/g, '_').slice(0, 50);
        
        let targetFolder = "";
        let folderPath = this.settings.incidentsFolder?.trim();
        
        if (folderPath) {
            folderPath = folderPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
            targetFolder = folderPath + "/";
            
            // Check if folder exists
            const folderAbstract = vault.getAbstractFileByPath(folderPath);
            if (!folderAbstract) {
                try {
                    // Try to create the root level folder at least
                    let currentPath = "";
                    const parts = folderPath.split('/');
                    for(const part of parts) {
                        currentPath = currentPath === "" ? part : `${currentPath}/${part}`;
                        let folderExists = vault.getAbstractFileByPath(currentPath);
                        if(!folderExists) {
                            await vault.createFolder(currentPath);
                        }
                    }
                } catch(e) {
                    console.error("Failed to create folder", e);
                }
            }
        }
        
        const filename = `${targetFolder}Incident-${safeTitle}.md`;

        const fileContent = `---
date: ${email.receivedDateTime}
sender: "${email.sender}"
subject: "${email.subject}"
conversation_topic: "${email.conversationTopic}"
status: "Pending"
tags: [incident]
cssclasses: [hide-properties]
---

# ${email.conversationTopic}

## Текущее саммари инцидента
${summary}

---
## Лог сообщений

**От кого:** ${email.sender}
**Дата:** ${email.receivedDateTime}
**Тема:** ${email.subject}
**Сообщение:**
${email.bodyPreview}
`;
        let file = vault.getAbstractFileByPath(filename) as TFile;
        if (file) {
            // Overwriting just in case
            await vault.modify(file, fileContent);
            return file;
        } else {
            return vault.create(filename, fileContent);
        }
    }

    async updateIncidentNote(file: TFile, email: EmailData, newSummary: string): Promise<void> {
        let content = await this.app.vault.read(file);
        
        // Simple heuristic to replace the old summary section
        const summaryRegex = /## Текущее саммари инцидента\n([\s\S]*?)\n---/m;
        if (summaryRegex.test(content)) {
            content = content.replace(summaryRegex, `## Текущее саммари инцидента\n${newSummary}\n\n---`);
        } else {
            // Fallback if formatting was modified
            content += `\n\n## Новое саммари:\n${newSummary}`;
        }

        // Add the new email to the log
        const newLogEntry = `\n**От кого:** ${email.sender}
**Дата:** ${email.receivedDateTime}
**Тема:** ${email.subject}
**Сообщение:**
${email.bodyPreview}\n---`;

        content += newLogEntry;

        await this.app.vault.modify(file, content);
    }

    async createTaskNote(name: string, initialTags: string[] = []): Promise<TFile> {
        const vault = this.app.vault;
        const folder = "tasks";
        await this.ensureFolder(folder);
        
        const dateStr = new Date().toISOString().split('T')[0];
        const fileName = `${folder}/Task-${name.replace(/[\\/:"*?<>|]/g, '_')}.md`;
        
        // Merge with default 'task' tag
        const tags = [...new Set(['task', ...initialTags])];
        const tagsStr = tags.length > 1 ? `[${tags.join(', ')}]` : tags[0];

        const content = `---
type: task
status: "To Do"
priority: 3
created: ${dateStr}
deadline: ${dateStr} 10:00
linked_project: 
tags: ${tagsStr}
cssclasses: [hide-properties]
---

# ${name}

\`\`\`monitoring-duration
\`\`\`

## 📋 Описание
Запишите здесь детали задачи...

## ✅ Чек-лист
- [ ] 

## 📝 Заметки
...
`;
        return vault.create(fileName, content);
    }

    async createProjectNote(name: string): Promise<TFile> {
        const vault = this.app.vault;
        const folder = "projects";
        await this.ensureFolder(folder);
        
        const dateStr = new Date().toISOString().split('T')[0];
        const fileName = `${folder}/Project-${name.replace(/[\\/:"*?<>|]/g, '_')}.md`;
        
        const content = `---
type: project
status: Active
started: ${dateStr}
target_date: 
owner: "${this.app.vault.getName()}"
tags: [project]
cssclasses: [hide-properties]
---

# ${name}

## 🎯 Цели проекта
1. 

## 🏗 Этапы (Milestones)
- [ ] Инициализация
- [ ] Разработка
- [ ] Тестирование
- [ ] Запуск

## 🔗 Связанные задачи
...

## 📚 Ресурсы
- [ ] Ссылка на документацию
`;
        return vault.create(fileName, content);
    }

    async ensureFolder(path: string) {
        const folder = this.app.vault.getAbstractFileByPath(path);
        if (!folder) {
            await this.app.vault.createFolder(path);
        }
    }

    async readNoteContent(file: TFile): Promise<string> {
        return await this.app.vault.read(file);
    }
}
