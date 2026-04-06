import { App, TFile } from 'obsidian';

export class FileService {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    async read(file: TFile): Promise<string> {
        return this.app.vault.read(file);
    }

    async modify(file: TFile, content: string): Promise<void> {
        await this.app.vault.modify(file, content);
    }

    async create(path: string, content: string): Promise<TFile> {
        return this.app.vault.create(path, content);
    }

    async delete(file: TFile): Promise<void> {
        await this.app.vault.delete(file);
    }

    async rename(file: TFile, newPath: string): Promise<void> {
        await this.app.fileManager.renameFile(file, newPath);
    }

    getFile(path: string): TFile | null {
        const file = this.app.vault.getAbstractFileByPath(path);
        return file instanceof TFile ? file : null;
    }

    async ensureFolder(path: string): Promise<void> {
        if (!this.app.vault.getAbstractFileByPath(path)) {
            await this.app.vault.createFolder(path);
        }
    }
}