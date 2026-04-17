import { Modal, TextComponent, ButtonComponent, TFile, Notice } from 'obsidian';
import { OutlookService, EmailData } from '../outlook/OutlookService';
import { LLMService } from '../llm/LLMService';
import { TemplateManager } from '../notes/TemplateManager';
import MonitoringPlugin from '../main';

export class EmailTopicModal extends Modal {
    private file: TFile;
    private onSave: (topics: string[]) => void;
    private topics: string[] = [];
    private newTopic: string = '';
    private plugin: MonitoringPlugin;
    private isChecking: boolean = false;

    constructor(app: any, file: TFile, onSave: (topics: string[]) => void, plugin: MonitoringPlugin) {
        super(app);
        this.file = file;
        this.onSave = onSave;
        this.plugin = plugin;
    }

    async onOpen() {
        const { contentEl } = this;
        const cache = this.app.metadataCache.getFileCache(this.file);
        this.topics = cache?.frontmatter?.['tracked_emails'] || [];

        this.render(contentEl);
    }

    private render(contentEl: HTMLElement): void {
        contentEl.empty();
        contentEl.createEl('h3', { text: 'Отслеживание писем' });

        const desc = contentEl.createEl('p');
        desc.textContent = 'Добавьте темы писем для отслеживания. Все письма с этими темами будут добавляться в проект.';

        const listContainer = contentEl.createDiv({ cls: 'email-topics-list' });
        this.renderTopicsList(listContainer);

        const addSection = contentEl.createDiv({ cls: 'email-topics-add' });
        addSection.style.marginTop = '16px';
        
        const input = new TextComponent(addSection);
        input.setPlaceholder('Новая тема письма');
        input.inputEl.style.width = '70%';
        input.onChange(v => this.newTopic = v);

        new ButtonComponent(addSection)
            .setButtonText('+')
            .onClick(() => {
                if (this.newTopic.trim() && !this.topics.includes(this.newTopic.trim())) {
                    this.topics.push(this.newTopic.trim());
                    this.newTopic = '';
                    input.setValue('');
                    this.renderTopicsList(contentEl.querySelector('.email-topics-list') as HTMLElement);
                }
            });

        const btnContainer = contentEl.createDiv();
        btnContainer.style.display = 'flex';
        btnContainer.style.gap = '10px';
        btnContainer.style.marginTop = '20px';
        
        new ButtonComponent(btnContainer)
            .setButtonText('Сохранить')
            .setCta()
            .onClick(() => {
                this.onSave(this.topics);
                this.close();
            });

        new ButtonComponent(btnContainer)
            .setButtonText('Отмена')
            .onClick(() => this.close());

        const checkSection = contentEl.createDiv();
        checkSection.style.marginTop = '24px';
        checkSection.style.paddingTop = '16px';
        checkSection.style.borderTop = '1px solid var(--border-color)';
        
        const checkBtn = checkSection.createEl('button', {
            cls: 'mod-cta',
            text: this.isChecking ? '⏳ Проверка...' : '📬 Проверить почту'
        });
        checkBtn.style.width = '100%';
        checkBtn.onclick = async () => {
            if (this.isChecking) return;
            if (this.topics.length === 0) {
                new Notice('Сначала добавьте темы для отслеживания!');
                return;
            }
            
            this.isChecking = true;
            checkBtn.textContent = '⏳ Проверка...';
            
            try {
                await this.checkAndProcessEmails();
                new Notice('Проверка писем завершена!');
            } catch (error) {
                console.error('Error checking emails:', error);
                new Notice('Ошибка при проверке писем: ' + error.message);
            } finally {
                this.isChecking = false;
                checkBtn.textContent = '📬 Проверить почту';
            }
        };
    }

    private async checkAndProcessEmails(): Promise<void> {
        const allEmails = await this.plugin.outlookService.fetchEmails();
        
        const trackedTopicsLower = this.topics.map(t => t.toLowerCase());
        
        const matchedEmails = allEmails.filter(email => {
            const topicLower = (email.conversationTopic || '').toLowerCase();
            return trackedTopicsLower.some(topic => topicLower.includes(topic));
        });

        if (matchedEmails.length === 0) {
            new Notice('Нет писем по отслеживаемым темам.');
            return;
        }

        const emailData = matchedEmails.map(e => ({
            sender: e.sender,
            subject: e.subject,
            body: e.bodyPreview,
            date: new Date(e.receivedDateTime).toLocaleDateString('ru-RU')
        }));

        const summary = await this.plugin.llmService.summarizeEmails(emailData);
        
        const topic = this.topics[0];
        
        await this.plugin.templateManager.createMailNote(
            topic,
            summary,
            emailData,
            this.file
        );
    }

    private renderTopicsList(container: HTMLElement): void {
        container.empty();
        if (this.topics.length === 0) {
            container.createEl('p', { text: 'Темы пока не добавлены', cls: 'empty-text' });
            return;
        }

        this.topics.forEach((topic, idx) => {
            const item = container.createDiv({ cls: 'email-topic-item' });
            
            item.createSpan({ text: topic, cls: 'email-topic-text' });

            const deleteBtn = item.createEl('button', { 
                text: '×', 
                cls: 'email-topic-delete',
                attr: { title: 'Удалить' }
            });
            deleteBtn.onclick = () => {
                this.topics.splice(idx, 1);
                this.renderTopicsList(container);
            };
        });
    }
}