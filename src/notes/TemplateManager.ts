import { App, TFile } from 'obsidian';
import { EmailData } from '../outlook/OutlookService';

export class TemplateManager {
    app: App;

    constructor(app: App) {
        this.app = app;
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
        const filename = `Incident-${safeTitle}.md`;

        const fileContent = `---
date: ${email.receivedDateTime}
sender: "${email.sender}"
subject: "${email.subject}"
conversation_topic: "${email.conversationTopic}"
status: "Pending"
tags: [incident]
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

    async readNoteContent(file: TFile): Promise<string> {
        return await this.app.vault.read(file);
    }
}
