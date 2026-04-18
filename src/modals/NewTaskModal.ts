import { Modal, TextComponent, ButtonComponent } from 'obsidian';

export class NewTaskModal extends Modal {
    onSubmit: (name: string) => void;
    taskName: string = "";
    private createCallback: () => void;

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

        this.createCallback = () => {
            if (this.taskName) {
                this.onSubmit(this.taskName);
                this.close();
            }
        };

        input.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.createCallback();
            }
        });

        new ButtonComponent(contentEl.createDiv({ cls: 'modal-button-container' }))
            .setButtonText("Создать")
            .setCta()
            .onClick(this.createCallback);
    }

    onClose() {
        this.contentEl.empty();
    }
}