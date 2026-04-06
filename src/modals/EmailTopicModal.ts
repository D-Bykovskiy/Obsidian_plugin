import { Modal, TextComponent, ButtonComponent, TFile } from 'obsidian';

export class EmailTopicModal extends Modal {
    private file: TFile;
    private onSave: (topics: string[]) => void;
    private topics: string[] = [];
    private newTopic: string = '';

    constructor(app: any, file: TFile, onSave: (topics: string[]) => void) {
        super(app);
        this.file = file;
        this.onSave = onSave;
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
