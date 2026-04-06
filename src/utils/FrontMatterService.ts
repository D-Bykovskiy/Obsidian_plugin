import { TFile, App } from 'obsidian';

export interface FrontMatterUpdates {
    [key: string]: any;
}

export class FrontMatterService {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    async update(file: TFile, updates: FrontMatterUpdates): Promise<void> {
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            for (const [key, value] of Object.entries(updates)) {
                fm[key] = value;
            }
        });
    }

    async get<T>(file: TFile, key: string, defaultValue?: T): Promise<T | undefined> {
        const cache = this.app.metadataCache.getFileCache(file);
        return cache?.frontmatter?.[key] as T ?? defaultValue;
    }

    async set(file: TFile, key: string, value: any): Promise<void> {
        await this.update(file, { [key]: value });
    }

    async delete(file: TFile, key: string): Promise<void> {
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            delete fm[key];
        });
    }
}