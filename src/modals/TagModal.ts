import { Modal, TextComponent } from 'obsidian';

export class TagModal extends Modal {
    onSubmit: (tag: string) => void;
    query: string = "";

    constructor(app: any, onSubmit: (tag: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: 'Добавить тег' });

        const input = new TextComponent(contentEl);
        input.setPlaceholder("Начните вводить название...");
        input.inputEl.style.width = "100%";
        input.inputEl.focus();

        const suggestionContainer = contentEl.createDiv({ cls: 'tag-suggestions' });
        // @ts-ignore
        const allTags = Object.keys(this.app.metadataCache.getTags()).map(t => t.substring(1));

        const renderSuggestions = (query: string) => {
            suggestionContainer.empty();
            allTags.filter(t => t.toLowerCase().includes(query.toLowerCase())).slice(0, 10).forEach(tag => {
                const item = suggestionContainer.createDiv({ cls: 'tag-suggestion-item', text: tag });
                item.onclick = () => { this.onSubmit(tag); this.close(); };
            });
        };

        input.onChange(val => {
            this.query = val;
            renderSuggestions(val);
        });

        input.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (this.query) {
                    this.onSubmit(this.query);
                    this.close();
                }
            }
        });

        renderSuggestions("");
    }

    onClose() {
        this.contentEl.empty();
    }
}