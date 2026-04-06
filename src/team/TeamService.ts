import { App, TFile } from 'obsidian';
import { MonitoringPluginSettings } from '../settings/SettingsTab';

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

    getCurrentUser(): string {
        const settings = this.getSettings();
        return settings?.currentUser || '';
    }

    async addTeamMember(name: string): Promise<void> {
        const routinesFile = this.app.vault.getAbstractFileByPath('routines.md');
        if (!routinesFile || !(routinesFile instanceof TFile)) {
            const content = `# Команда\n- ${name}\n`;
            await this.app.vault.create('routines.md', content);
            return;
        }

        const content = await this.app.vault.read(routinesFile);
        if (!content.includes('# Команда') && !content.includes('# команда')) {
            const newContent = content + '\n# Команда\n- ' + name + '\n';
            await this.app.vault.modify(routinesFile, newContent);
        } else if (!content.includes('- ' + name)) {
            const lines = content.split('\n');
            let inTeamSection = false;
            const newLines: string[] = [];
            
            for (const line of lines) {
                if (line.trim().toLowerCase() === '# команда') {
                    inTeamSection = true;
                }
                if (inTeamSection && (line.startsWith('# ') || line.startsWith('## '))) {
                    newLines.push(line);
                    newLines.push('- ' + name);
                    inTeamSection = false;
                    continue;
                }
                newLines.push(line);
            }
            
            if (inTeamSection) {
                newLines.push('- ' + name);
            }
            
            await this.app.vault.modify(routinesFile, newLines.join('\n'));
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

    private getSettings(): MonitoringPluginSettings | null {
        // @ts-ignore
        return this.app.plugins.plugins['monitoring-plugin']?.settings || null;
    }
}
