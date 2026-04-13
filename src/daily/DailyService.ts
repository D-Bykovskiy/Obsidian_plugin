import { App, TFile } from 'obsidian';
import { MonitoringPluginSettings } from '../settings/SettingsTab';

interface RoutineTask {
    name: string;
    time?: string;
}

interface DayRoutines {
    [day: string]: RoutineTask[];
}

export class DailyService {
    app: App;
    settings: MonitoringPluginSettings;

    constructor(app: App, settings: MonitoringPluginSettings) {
        this.app = app;
        this.settings = settings;
    }

    private getDayKey(date: Date): string {
        const days: { [key: number]: string } = {
            0: 'sun',
            1: 'mon',
            2: 'tue',
            3: 'wed',
            4: 'thu',
            5: 'fri',
            6: 'sat'
        };
        return days[date.getDay()];
    }

    private getDayName(date: Date): string {
        const days: { [key: number]: string } = {
            0: 'Воскресенье',
            1: 'Понедельник',
            2: 'Вторник',
            3: 'Среда',
            4: 'Четверг',
            5: 'Пятница',
            6: 'Суббота'
        };
        return days[date.getDay()];
    }

    async parseRoutines(): Promise<DayRoutines> {
        const routinesFile = this.app.vault.getAbstractFileByPath('routines.md');
        if (!routinesFile || !(routinesFile instanceof TFile)) {
            return this.getDefaultRoutines();
        }

        try {
            const content = await this.app.vault.read(routinesFile);
            return this.parseRoutinesContent(content);
        } catch (e) {
            console.error('Error reading routines.md:', e);
            return this.getDefaultRoutines();
        }
    }

    private getDefaultRoutines(): DayRoutines {
        return {
            every_day: [
                { name: 'Проверить почту', time: '09:00' },
                { name: 'Обзор задач на день', time: '09:30' },
                { name: 'Актуализировать статусы задач', time: '17:00' }
            ],
            mon: [],
            tue: [
                { name: 'Подготовка еженедельного отчёта', time: '14:00' }
            ],
            wed: [],
            thu: [],
            fri: [
                { name: 'Собрать вопросы для встречи', time: '14:00' },
                { name: 'Формирование повестки', time: '15:00' }
            ],
            sat: [],
            sun: []
        };
    }

    private parseRoutinesContent(content: string): DayRoutines {
        const routines: DayRoutines = {
            every_day: [],
            mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: []
        };
        
        const lines = content.split('\n');
        let currentDay = '';
        
        for (const line of lines) {
            const dayMatch = line.match(/^(\w+):\s*$/);
            if (dayMatch) {
                currentDay = dayMatch[1];
                if (!routines[currentDay]) {
                    routines[currentDay] = [];
                }
                continue;
            }
            
            const taskMatch = line.match(/^\s*-\s*["']?([^"']+)["']?(?:\s*\|\s*(\d{2}:\d{2}))?/);
            if (taskMatch && currentDay) {
                routines[currentDay].push({
                    name: taskMatch[1].trim(),
                    time: taskMatch[2]
                });
            }
        }
        
        return routines;
    }

    async getTodayTasks(): Promise<TFile[]> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayEnd = new Date(today);
        todayEnd.setHours(23, 59, 59, 999);

        const tasks: TFile[] = [];
        const files = this.app.vault.getMarkdownFiles();

        for (const file of files) {
            if (!file.basename.startsWith('Task-')) continue;
            
            const cache = this.app.metadataCache.getFileCache(file);
            const deadlineStr = cache?.frontmatter?.['deadline'];
            
            if (!deadlineStr) continue;

            if (this.isDeadlineMatch(deadlineStr, today, todayEnd)) {
                tasks.push(file);
            }
        }

        return tasks;
    }

    private isDeadlineMatch(deadlineStr: string, today: Date, todayEnd: Date): boolean {
        if (deadlineStr.includes(' to ')) {
            const [startStr, endStr] = deadlineStr.split(' to ');
            const start = this.parseDate(startStr.trim());
            const end = this.parseDate(endStr.split(' ')[0].trim());
            
            if (start && end) {
                return today >= start && today <= end;
            }
        } else {
            const date = this.parseDate(deadlineStr.split(' ')[0].trim());
            if (date) {
                return date >= today && date <= todayEnd;
            }
        }
        
        return false;
    }

    private parseDate(dateStr: string): Date | null {
        try {
            return new Date(dateStr);
        } catch {
            return null;
        }
    }

    async createDailyNote(): Promise<TFile> {
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];
        const userName = this.settings.currentUser || 'default';
        const folderPath = `daily-${userName}`;
        const filePath = `${folderPath}/${dateStr}.md`;

        const existingFile = this.app.vault.getAbstractFileByPath(filePath);
        if (existingFile instanceof TFile) {
            return existingFile;
        }

        await this.ensureFolder(folderPath);

        const content = await this.buildDailyContent(today);
        return this.app.vault.create(filePath, content);
    }

    private async ensureFolder(path: string) {
        const folder = this.app.vault.getAbstractFileByPath(path);
        if (!folder) {
            await this.app.vault.createFolder(path);
        }
    }

    private async buildDailyContent(today: Date): Promise<string> {
        const routines = await this.parseRoutines();
        const todayTasks = await this.getTodayTasks();
        const dayKey = this.getDayKey(today);
        const dayName = this.getDayName(today);
        const weekNumber = this.getWeekNumber(today);

        const everyDayRoutine = routines.every_day || [];
        const dayRoutine = routines[dayKey] || [];
        const allDayRoutine = [...everyDayRoutine, ...dayRoutine];

        let tasksList = '';
        if (todayTasks.length === 0) {
            tasksList = '*Нет задач на сегодня*';
        } else {
            for (const task of todayTasks) {
                const cache = this.app.metadataCache.getFileCache(task);
                const status = cache?.frontmatter?.['status'] || 'To Do';
                const icon = this.getStatusIcon(status);
                tasksList += `- ${icon} [[${task.basename}]]\n`;
            }
        }

        let scheduleList = '';
        if (allDayRoutine.length === 0) {
            scheduleList = '*Расписание не задано*';
        } else {
            const sorted = [...allDayRoutine].sort((a, b) => {
                if (!a.time) return 1;
                if (!b.time) return -1;
                return a.time.localeCompare(b.time);
            });
            for (const task of sorted) {
                scheduleList += `- [ ] ${task.name}${task.time ? ` [${task.time}]` : ''}\n`;
            }
        }

        const dateFormatted = today.toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        return `---
daily: true
cssclasses: [hide-properties]
---

\`\`\`monitoring-duration
\`\`\`

# 📅 ${dateFormatted} (${dayName}) • Неделя ${weekNumber}

---

## 🕐 Расписание дня
${scheduleList}

---

## ✅ Задачи на сегодня
${tasksList}

---

## 📝 Заметки

`;
    }

    private getWeekNumber(date: Date): number {
        const startOfYear = new Date(date.getFullYear(), 0, 1);
        const pastDaysOfYear = (date.getTime() - startOfYear.getTime()) / 86400000;
        return Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
    }

    private getStatusIcon(status: string): string {
        const s = status.toLowerCase();
        if (s.includes('завершен') || s.includes('выполнено') || s === 'done' || s === 'completed') return '✅';
        if (s.includes('в работе') || s.includes('процессе') || s === 'active' || s === 'in progress') return '🔄';
        return '⬜';
    }
}
