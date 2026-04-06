import { Modal, TextComponent, ButtonComponent } from 'obsidian';

export class NewTaskModal extends Modal {
    onSubmit: (name: string) => void;
    taskName: string = "";

    constructor(app: any, onSubmit: (name: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: 'Создать новую задачу' });

        const input = new TextComponent(contentEl);
        input.setPlaceholder("Название...");
        input.inputEl.style.width = "100%";
        input.onChange(val => this.taskName = val);

        requestAnimationFrame(() => {
            input.inputEl.focus();
        });

        new ButtonComponent(contentEl.createDiv({ cls: 'modal-button-container' }))
            .setButtonText("Создать")
            .setCta()
            .onClick(() => {
                if (this.taskName) {
                    this.onSubmit(this.taskName);
                    this.close();
                }
            });
    }

    onClose() {
        this.contentEl.empty();
    }
}