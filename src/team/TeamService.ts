import { App, TFile } from 'obsidian';

export class TeamService {
    app: App;

    constructor(app: App) {
        this.app = app;
    }

    async getTeamMembers(): Promise<string[]> {
        const routinesFile = this.app.vault.getAbstractFileByPath('routines.md');
        if (!routinesFile || !(routinesFile instanceof TFile)) {
            return [];
        }

        try {
            const content = await this.app.vault.read(routinesFile);
            return this.parseTeamFromContent(content);
        } catch (e) {
            console.error('Error reading routines.md:', e);
            return [];
        }
    }

    private parseTeamFromContent(content: string): string[] {
        const members: string[] = [];
        let inTeamSection = false;
        const lines = content.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed.toLowerCase() === '# команда' || trimmed.toLowerCase() === '# team') {
                inTeamSection = true;
                continue;
            }

            if (inTeamSection) {
                if (trimmed.startsWith('# ') || trimmed.startsWith('## ')) {
                    inTeamSection = false;
                    continue;
                }

                const match = trimmed.match(/^[-*]\s*(.+)$/);
                if (match && match[1].trim()) {
                    members.push(match[1].trim());
                }
            }
        }

        return members;
    }
}
