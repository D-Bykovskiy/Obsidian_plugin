import { App, TFile } from 'obsidian';
import { VaultData, TaskData, ProjectData, IncidentData, SimpleNoteData } from './types';

export class DataService {
    private app: App;
    private incidentsFolder: string;
    private simpleNotesFolder: string;

    constructor(app: App, incidentsFolder: string, simpleNotesFolder: string = 'notes') {
        this.app = app;
        this.incidentsFolder = incidentsFolder.toLowerCase();
        this.simpleNotesFolder = simpleNotesFolder.toLowerCase();
    }

    async fetchVaultData(): Promise<VaultData> {
        const incidents: IncidentData[] = [];
        const tasks: TaskData[] = [];
        const projects: ProjectData[] = [];
        const notes: SimpleNoteData[] = [];
        
        const files = this.app.vault.getMarkdownFiles().filter(f => {
            const pathLower = f.path.toLowerCase();
            return !pathLower.includes('/архив/') && !pathLower.endsWith('/архив');
        });
        
        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            let rawTags: any = cache?.frontmatter?.tags || [];
            
            const tags: string[] = this.normalizeTags(rawTags);
            const cleanTags = this.cleanTags(tags);
            
            const filePathLower = file.path.toLowerCase();
            const fileBasename = file.basename;
            const linkedProject = cache?.frontmatter?.['linked_project'];

            if (this.isIncident(filePathLower, cleanTags)) {
                incidents.push(this.parseIncident(file, cache, fileBasename));
            } else if (this.isTask(cleanTags, filePathLower, linkedProject)) {
                tasks.push(this.parseTask(file, cache, fileBasename, cleanTags, linkedProject));
            } else if (this.isProject(cleanTags, filePathLower)) {
                projects.push(this.parseProject(file, cache, fileBasename));
            } else if (this.isNote(cleanTags, filePathLower)) {
                notes.push(this.parseNote(file, cache, fileBasename, cleanTags));
            }
        }

        return {
            incidents: incidents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
            tasks: tasks.sort((a, b) => a.name.localeCompare(b.name)),
            projects: projects.sort((a, b) => a.name.localeCompare(b.name)),
            notes: notes.sort((a, b) => a.name.localeCompare(b.name))
        };
    }

    private normalizeTags(rawTags: any): string[] {
        if (typeof rawTags === 'string') {
            return rawTags.split(/[,;]/).map((t: string) => t.trim());
        } else if (Array.isArray(rawTags)) {
            return rawTags.map((t: any) => String(t).trim());
        }
        return [];
    }

    private cleanTags(tags: string[]): string[] {
        return tags
            .filter(t => t && t.length > 0)
            .map(t => t.startsWith('#') ? t.substring(1).toLowerCase() : t.toLowerCase());
    }

    private isIncident(path: string, tags: string[]): boolean {
        return path.startsWith(this.incidentsFolder) || tags.includes('incident');
    }

    private isTask(tags: string[], path: string, linkedProject: any): boolean {
        return tags.includes('task') || path.startsWith('tasks/') || !!linkedProject;
    }

    private isProject(tags: string[], path: string): boolean {
        return tags.includes('project') || path.startsWith('projects/');
    }

    private isNote(tags: string[], path: string): boolean {
        return tags.includes('note') || (this.simpleNotesFolder.length > 0 && path.startsWith(this.simpleNotesFolder));
    }

    private parseIncident(file: TFile, cache: any, basename: string): IncidentData {
        return {
            id: basename.replace(/^Incident-/, ''),
            name: cache?.frontmatter?.['conversation_topic'] || basename,
            status: cache?.frontmatter?.['status'] || 'Unknown',
            date: cache?.frontmatter?.['date'] || 'Unknown',
            path: file.path,
            sender: cache?.frontmatter?.['sender'] || 'Unknown'
        };
    }

    private parseTask(file: TFile, cache: any, basename: string, tags: string[], linkedProject: any): TaskData {
        return {
            id: basename,
            name: basename.replace(/^Task-/, ''),
            status: cache?.frontmatter?.['status'] || 'To Do',
            deadline: cache?.frontmatter?.['deadline'] || '',
            path: file.path,
            priority: cache?.frontmatter?.['priority'] || 3,
            tags,
            linkedProject,
            responsible: cache?.frontmatter?.['responsible'] || undefined
        };
    }

    private parseProject(file: TFile, cache: any, basename: string): ProjectData {
        return {
            id: basename,
            name: basename.replace(/^Project-/, ''),
            status: cache?.frontmatter?.['status'] || 'Active',
            path: file.path,
            goal: cache?.frontmatter?.['goal'] || '',
            priority: cache?.frontmatter?.['priority'],
            target_date: cache?.frontmatter?.['target_date'],
            responsible: cache?.frontmatter?.['responsible'] || undefined,
            tracked_emails: cache?.frontmatter?.['tracked_emails'] || []
        };
    }

    private parseNote(file: TFile, cache: any, basename: string, tags: string[]): SimpleNoteData {
        return {
            id: basename,
            name: basename,
            path: file.path,
            created: cache?.frontmatter?.['created'] || '',
            tags,
            author: cache?.frontmatter?.['author'] || undefined
        };
    }

    async updateItemStatus(path: string, newStatus: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                fm['status'] = newStatus;
            });
        }
    }

    async getTrackedSubjects(dashboardFn: string): Promise<string[]> {
        const dashboardFile = this.app.vault.getAbstractFileByPath(dashboardFn) as TFile;
        if (!dashboardFile) return [];
        
        const cache = this.app.metadataCache.getFileCache(dashboardFile);
        if (cache?.frontmatter && Array.isArray(cache.frontmatter['tracked_subjects'])) {
            return cache.frontmatter['tracked_subjects'];
        }
        return [];
    }
}
