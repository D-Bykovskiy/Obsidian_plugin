import { BaseView } from './BaseView';
import { TaskData, ProjectData } from './types';

export class CalendarView extends BaseView {
    private tasks: TaskData[];
    private projects: ProjectData[];
    private weekOffset: number;
    private onRefresh: () => void;

    constructor(app: any, tasks: TaskData[], projects: ProjectData[], weekOffset: number, onRefresh: () => void) {
        super(app);
        this.tasks = tasks;
        this.projects = projects;
        this.weekOffset = weekOffset;
        this.onRefresh = onRefresh;
    }

    render(container: Element): void {
        const wrapper = container.createDiv({ cls: 'monitoring-calendar-wrapper' });

        this.renderNavigation(wrapper);
        this.renderWeekHeader(wrapper);
        this.renderDayHeaders(wrapper);
        this.renderTimelines(wrapper);
    }

    private renderNavigation(wrapper: HTMLElement): void {
        const navHeader = wrapper.createDiv({ cls: 'calendar-week-nav' });
        
        navHeader.createEl('button', { 
            text: '← Пред. неделя', 
            cls: 'monitoring-refresh-btn' 
        }).onclick = () => { this.weekOffset--; this.onRefresh(); };

        navHeader.createEl('button', { 
            text: 'Сегодня', 
            cls: 'monitoring-glass-btn' 
        }).onclick = () => { this.weekOffset = 0; this.onRefresh(); };

        navHeader.createEl('button', { 
            text: 'След. неделя →', 
            cls: 'monitoring-refresh-btn' 
        }).onclick = () => { this.weekOffset++; this.onRefresh(); };
        
        const todayAt = new Date();
        const startOfWeek = this.getWeekStart(todayAt);
        
        navHeader.createSpan({ 
            cls: 'week-label', 
            text: `Неделя: ${startOfWeek.toLocaleDateString()} - ${this.getWeekEnd(startOfWeek).toLocaleDateString()}` 
        });
    }

    private renderWeekHeader(wrapper: HTMLElement): void {
        const daysHeader = wrapper.createDiv({ cls: 'calendar-linear-header' });
        const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        
        const datesInWeek = this.getDatesInWeek();
        
        datesInWeek.forEach((d, i) => {
            const dayHead = daysHeader.createDiv({ cls: 'calendar-linear-day-head' });
            dayHead.createDiv({ cls: 'day-name', text: weekDays[i] });
            dayHead.createDiv({ cls: 'day-num', text: d.getDate().toString() });
            
            if (d.toDateString() === new Date().toDateString()) {
                dayHead.addClass('is-today');
            }
        });
    }

    private renderDayHeaders(wrapper: HTMLElement): void {
        // Headers are rendered in renderWeekHeader
    }

    private renderTimelines(wrapper: HTMLElement): void {
        this.renderTimeline(wrapper, "Проекты (эта неделя)", this.projects, 'project');
        this.renderTimeline(wrapper, "Задачи (эта неделя)", this.tasks, 'task');
    }

    private renderTimeline(wrapper: HTMLElement, title: string, items: any[], type: 'task' | 'project'): void {
        wrapper.createEl('h3', { text: title, attr: { style: 'margin-top: 30px;' } });
        
        const timeline = wrapper.createDiv({ cls: 'calendar-linear-timeline' });
        
        const grid = timeline.createDiv({ cls: 'timeline-grid' });
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startOfWeek = this.getWeekStart(new Date());
        const todayCol = Math.floor((today.getTime() - startOfWeek.getTime()) / (1000 * 60 * 60 * 24));
        
        for (let i = 0; i < 7; i++) {
            const line = grid.createDiv({ cls: 'timeline-line' });
            if (i === todayCol && todayCol >= 0 && todayCol < 7) {
                line.addClass('timeline-line-today');
            }
        }

        const entriesContainer = timeline.createDiv({ cls: 'timeline-entries' });
        const weekEnd = this.getWeekEnd(startOfWeek);

        items.forEach(item => {
            const { start, end } = this.getItemDates(item, type);
            if (!start) return;

            const actualEnd = end || start;
            
            if (actualEnd < startOfWeek || start > weekEnd) return;

            const visibleStart = start < startOfWeek ? startOfWeek : start;
            const visibleEnd = actualEnd > weekEnd ? weekEnd : actualEnd;

            const { startCol, span } = this.calculatePosition(visibleStart, visibleEnd, startOfWeek);
            if (span <= 0) return;

            const entry = entriesContainer.createDiv({ 
                cls: 'timeline-entry ' + type + '-entry ' + this.getStatusClass(item.status) + (type === 'task' ? ' priority-' + item.priority : ''),
                attr: { 
                    style: 'grid-column: ' + (startCol + 1) + ' / span ' + span,
                    title: this.getEntryTooltip(item, type, start, actualEnd)
                }
            });
            
            const label = entry.createDiv({ cls: 'entry-label' });
            label.createSpan({ text: item.name });
            
            const duration = Math.ceil((actualEnd.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            if (duration > 1) {
                entry.createDiv({ cls: 'entry-period', text: duration + 'д' });
            }

            entry.onclick = () => this.openFile(item.path);
        });
    }

    private getWeekStart(date: Date): Date {
        const startOfWeek = new Date(date);
        const dayOfWeek = date.getDay();
        const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1) + (this.weekOffset * 7); 
        startOfWeek.setDate(diff);
        startOfWeek.setHours(0, 0, 0, 0);
        return startOfWeek;
    }

    private getWeekEnd(startOfWeek: Date): Date {
        const weekEnd = new Date(startOfWeek);
        weekEnd.setDate(startOfWeek.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        return weekEnd;
    }

    private getDatesInWeek(): Date[] {
        const startOfWeek = this.getWeekStart(new Date());
        const dates: Date[] = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(startOfWeek);
            d.setDate(startOfWeek.getDate() + i);
            dates.push(d);
        }
        return dates;
    }

    private getItemDates(item: any, type: 'task' | 'project'): { start: Date | null; end: Date | null } {
        if (type === 'task') {
            const deadlineStr = item.deadline || "";
            if (deadlineStr.includes(' to ')) {
                const parts = deadlineStr.split(' to ');
                return { 
                    start: new Date(parts[0].trim()), 
                    end: new Date(parts[1].split(' ')[0].trim()) 
                };
            } else if (deadlineStr) {
                const date = new Date(deadlineStr.split(' ')[0].trim());
                return { start: date, end: date };
            }
            return { start: null, end: null };
        } else {
            const startStr = item.started;
            if (!startStr) return { start: null, end: null };
            const start = new Date(startStr);
            const endStr = item.target_date || item.deadline;
            const end = endStr ? new Date(endStr.split(' ')[0].trim()) : new Date(start);
            return { start, end };
        }
    }

    private calculatePosition(visibleStart: Date, visibleEnd: Date, weekStart: Date): { startCol: number; span: number } {
        const normStart = new Date(visibleStart); normStart.setHours(0, 0, 0, 0);
        const normEnd = new Date(visibleEnd); normEnd.setHours(0, 0, 0, 0);
        const normWeekStart = new Date(weekStart); normWeekStart.setHours(0, 0, 0, 0);

        const startCol = Math.max(0, Math.floor((normStart.getTime() - normWeekStart.getTime()) / (1000 * 60 * 60 * 24)));
        const duration = Math.ceil((normEnd.getTime() - normStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const span = Math.min(7 - startCol, duration);

        return { startCol, span };
    }

    private getEntryTooltip(item: any, type: 'task' | 'project', start: Date, end: Date): string {
        if (type === 'project') {
            return 'Проект: ' + item.name + '\nЦель: ' + (item.goal || 'не задана') + '\nСтатус: ' + item.status + '\nПериод: ' + start.toLocaleDateString() + ' - ' + end.toLocaleDateString();
        } else {
            return 'Задача: ' + item.name + '\nСрок: ' + (item.deadline || 'не указан') + '\nПриоритет: ' + item.priority + '\nСтатус: ' + item.status;
        }
    }
}
