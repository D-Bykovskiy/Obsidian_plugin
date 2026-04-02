import { BaseView } from './BaseView';
import { SimpleNoteData } from './types';

export class NotesView extends BaseView {
    private notes: SimpleNoteData[];

    constructor(app: any, notes: SimpleNoteData[]) {
        super(app);
        this.notes = notes;
    }

    render(container: Element): void {
        container.createEl('h3', { text: 'Мои Заметки' });
        
        if (this.notes.length === 0) {
            this.createEmptyState(container, 'Заметок пока нет.');
            return;
        }

        const grid = container.createDiv({ cls: 'monitoring-notes-grid' });
        
        this.notes.forEach(note => {
            const card = grid.createDiv({ cls: 'monitoring-note-card' });
            card.createDiv({ cls: 'note-card-title', text: note.name });
            
            const meta = card.createDiv({ cls: 'note-card-meta' });
            meta.createSpan({ text: 'Создана: ' + (note.created || '---') });
            
            if (note.author) {
                meta.createSpan({ text: ' | Автор: ' + note.author });
            }
            
            const tagsCont = card.createDiv({ cls: 'note-card-tags' });
            note.tags.filter(t => t !== 'note').forEach(tag => {
                tagsCont.createSpan({ cls: 'monitoring-tag-pill', text: '#' + tag });
            });

            card.onclick = () => this.openFile(note.path);
        });
    }
}
