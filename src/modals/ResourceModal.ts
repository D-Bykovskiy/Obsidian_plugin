import { Modal, TextComponent, ButtonComponent } from 'obsidian';

export class ResourceModal extends Modal {
    link: string = "";
    description: string = "";
    onSubmit: (link: string, desc: string) => void;

    constructor(app: any, onSubmit: (link: string, desc: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    async browsePath(): Promise<string | null> {
        return new Promise((resolve) => {
            const proc = require('child_process').spawn('powershell', [
                '-Command',
                `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Title = 'Выберите файл или папку'; $f.CheckFileExists = $false; $f.CheckPathExists = $true; $f.FileName = ''; $f.Filter = 'Все файлы (*.*)|*.*'; if ($f.ShowDialog() -eq 'OK') { $f.FileName } else { '' }`
            ], { stdio: 'pipe' });
            let output = '';
            proc.stdout.on('data', (data: any) => output += data.toString());
            proc.stderr.on('data', (data: any) => console.error(data.toString()));
            proc.on('close', () => {
                resolve(output.trim() || null);
            });
        });
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: 'Добавить новый ресурс' });

        const lRow = contentEl.createDiv();
        lRow.style.display = 'flex';
        lRow.style.gap = '8px';
        lRow.style.marginBottom = '8px';
        
        const lInput = new TextComponent(lRow);
        lInput.setPlaceholder("http://... или C:\\...");
        lInput.onChange(val => this.link = val);
        lInput.inputEl.style.flex = "1";

        const browseBtn = new ButtonComponent(lRow);
        browseBtn.setButtonText("📁 Обзор");
        browseBtn.onClick(async () => {
            const selectedPath = await this.browsePath();
            if (selectedPath) {
                this.link = selectedPath;
                lInput.setValue(this.link);
            }
        });

        const dInput = new TextComponent(contentEl);
        dInput.setPlaceholder("Описание...");
        dInput.onChange(val => this.description = val);
        dInput.inputEl.style.width = "100%";

        dInput.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (this.link) {
                    this.onSubmit(this.link, this.description);
                    this.close();
                }
            }
        });

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