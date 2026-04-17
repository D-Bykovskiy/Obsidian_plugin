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

    async createTaskNote(name: string, initialTags: string[] = [], linkedProject: string = "", parentFile: TFile | null = null): Promise<TFile> {
        const vault = this.app.vault;
        const folder = "tasks";
        await this.ensureFolder(folder);
        
        const dateStr = new Date().toISOString().split('T')[0];
        const fileName = `${folder}/Task-${name.replace(/[\\/:"*?<>|]/g, '_')}.md`;
        
        // Merge with default 'task' tag
        const tags = [...new Set(['task', ...initialTags])];
        const tagsStr = tags.length > 1 ? `[${tags.join(', ')}]` : tags[0];

        // Add parent to frontmatter if exists
        let parentFrontmatter = '';
        if (parentFile) {
            parentFrontmatter = `\nparent: "[[${parentFile.basename}]]"`;
        }

        const content = `---
type: task
status: "To Do"
priority: 3
created: ${dateStr}
deadline: ${dateStr} 10:00
linked_project: "${linkedProject}"${parentFrontmatter}
tags: ${tagsStr}
responsible: "${this.settings.currentUser}"
cssclasses: [hide-properties]
---

# ${name}

\`\`\`monitoring-duration
\`\`\`

${parentFile ? `**Проект:** [[${parentFile.basename}]]\n` : ''}## 📋 Описание
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
        
        const codeBlock = '```monitoring-duration\n```';
        const content = `---
type: project
status: Active
started: ${dateStr}
target_date: 
owner: "${this.app.vault.getName()}"
goal: ""
tags: [project]
responsible: "${this.settings.currentUser}"
tracked_emails: []
cssclasses: [hide-properties]
---

# ${name}

${codeBlock}

## 🎯 Цели проекта
1. 

## 🏗 Этапы (Milestones)
- [ ] Инициализация
- [ ] Разработка
- [ ] Тестирование
- [ ] Запуск

## 📬 Письма

`;

        return vault.create(fileName, content);
    }

    async createSimpleNote(name: string): Promise<TFile> {
        const vault = this.app.vault;
        const folder = this.settings.simpleNotesFolder || "notes";
        await this.ensureFolder(folder);
        
        const dateStr = new Date().toISOString().split('T')[0];
        const fileName = `${folder}/${name.replace(/[\\/:"*?<>|]/g, '_')}.md`;
        
        const content = `---
type: note
created: ${dateStr}
author: "${this.settings.currentUser}"
tags: [note]
cssclasses: [hide-properties]
---

# ${name}

\`\`\`monitoring-duration
\`\`\`

## 📝 Текст заметки
Начните писать здесь...

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

    async updateSubtaskTable(parentFile: TFile, taskFile: TFile): Promise<void> {
        let content = await this.app.vault.read(parentFile);
        
        const taskContent = await this.app.vault.read(taskFile);
        const statusMatch = taskContent.match(/^status:\s*["']?(.+?)["']?\s*$/m);
        const deadlineMatch = taskContent.match(/^deadline:\s*["']?(.+?)["']?\s*$/m);
        
        const status = statusMatch ? statusMatch[1].trim() : 'To Do';
        const deadline = deadlineMatch ? deadlineMatch[1].trim() : 'Не задано';
        const statusIcon = this.getStatusIcon(status);
        
        const header = "## 📋 Список подзадач";
        const listItem = `- ${statusIcon} [[${taskFile.basename}]] | ${status} | ${deadline}`;

        if (content.includes(header)) {
            content = content.replace(header, `${header}\n${listItem}`);
        } else {
            const logHeader = "## Лог сообщений";
            const section = `\n${header}\n${listItem}\n`;
            
            if (content.includes(logHeader)) {
                content = content.replace(logHeader, `${section}${logHeader}`);
            } else {
                content += section;
            }
        }

        await this.app.vault.modify(parentFile, content);
    }

    async updateSubtaskStatusIcon(taskFile: TFile): Promise<void> {
        const files = this.app.vault.getMarkdownFiles();
        const taskBasename = taskFile.basename;
        
        const cache = this.app.metadataCache.getFileCache(taskFile);
        const newStatus = cache?.frontmatter?.['status'] || 'To Do';
        const newIcon = this.getStatusIcon(newStatus);
        
        for (const file of files) {
            if (file.path === taskFile.path) continue;
            
            const content = await this.app.vault.read(file);
            
            if (content.includes(`[[${taskBasename}]]`)) {
                const regex = new RegExp(`(- [✅🔄⬜] \\[\\[${taskBasename}\\]\\][^\\n]*)`);
                const match = content.match(regex);
                
                if (match) {
                    const oldLine = match[1];
                    const newLine = oldLine.replace(/^- [✅🔄⬜]/, `- ${newIcon}`);
                    const updatedContent = content.replace(oldLine, newLine);
                    await this.app.vault.modify(file, updatedContent);
                }
            }
        }
    }

    private getStatusIcon(status: string): string {
        const s = status.toLowerCase();
        if (s.includes('завершен') || s.includes('выполнено') || s === 'done' || s === 'completed') return '✅';
        if (s.includes('в работе') || s.includes('процессе') || s === 'active' || s === 'in progress') return '🔄';
        return '⬜';
    }

    async createMailNote(
        topic: string, 
        summary: string, 
        emails: {sender: string, subject: string, body: string, date: string}[],
        parentFile: TFile
    ): Promise<TFile> {
        const vault = this.app.vault;
        const safeTopic = topic.replace(/[\\/:"*?<>|]/g, '_').slice(0, 50);
        const safeFileName = `Письма-${safeTopic}`;
        
        const parentFolder = parentFile.parent?.path || '';
        const mailFolderPath = parentFolder ? `${parentFolder}/mail` : 'mail';
        
        const folderAbstract = vault.getAbstractFileByPath(mailFolderPath);
        if (!folderAbstract) {
            try {
                await vault.createFolder(mailFolderPath);
            } catch(e) {
                console.error("Failed to create mail folder", e);
            }
        }
        
        const filename = `${mailFolderPath}/${safeFileName}.md`;
        
        const emailsList = emails.map(e => 
            `**${e.date}** — ${e.sender}\nТема: ${e.subject}\n${e.body.slice(0, 300)}${e.body.length > 300 ? '...' : ''}`
        ).join('\n\n---\n\n');

        const fileContent = `---
type: mail_note
parent: "[[${parentFile.basename}]]"
topic: "${topic}"
created: ${new Date().toISOString().split('T')[0]}
cssclasses: [hide-properties]
---

# Письма: ${topic}

## 📝 Саммари
${summary}

---

## 📧 Письма (${emails.length})

${emailsList}
`;

        let file = vault.getAbstractFileByPath(filename) as TFile;
        if (file) {
            await vault.modify(file, fileContent);
        } else {
            file = await vault.create(filename, fileContent);
        }

        await this.addMailLinkToParent(parentFile, file, topic);
        
        return file;
    }

    private async addMailLinkToParent(parentFile: TFile, mailFile: TFile, topic: string): Promise<void> {
        let content = await this.app.vault.read(parentFile);
        
        const linkText = `- [[${mailFile.basename}]] — ${topic}`;
        const header = '## 📧 Заметки писем';
        
        if (content.includes(header)) {
            const linkRegex = new RegExp(`(\n${header}\n)([\s\S]*?)(?=\n## |\n---|\n#|$)`);
            const match = content.match(linkRegex);
            if (match) {
                if (!match[2].includes(mailFile.basename)) {
                    content = content.replace(linkRegex, `$1${linkText}\n$2`);
                }
            }
        } else {
            content += `\n\n${header}\n${linkText}\n`;
        }
        
        await this.app.vault.modify(parentFile, content);
    }
}
