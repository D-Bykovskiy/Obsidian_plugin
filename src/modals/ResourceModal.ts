import { Modal, TextComponent, ButtonComponent } from 'obsidian';

export class ResourceModal extends Modal {
    link: string = "";
    description: string = "";
    onSubmit: (link: string, desc: string) => void;

    constructor(app: any, onSubmit: (link: string, desc: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: 'Добавить новый ресурс' });

        const lInput = new TextComponent(contentEl);
        lInput.setPlaceholder("http://...");
        lInput.onChange(val => this.link = val);
        lInput.inputEl.style.width = "100%";

        const dInput = new TextComponent(contentEl);
        dInput.setPlaceholder("Описание...");
        dInput.onChange(val => this.description = val);
        dInput.inputEl.style.width = "100%";

        new ButtonComponent(contentEl.createDiv({ cls: 'modal-button-container' }))
            .setButtonText("Добавить")
            .setCta()
            .onClick(() => {
                if (this.link) {
                    this.onSubmit(this.link, this.description);
                    this.close();
                }
            });
    }

    onClose() {
        this.contentEl.empty();
    }
}