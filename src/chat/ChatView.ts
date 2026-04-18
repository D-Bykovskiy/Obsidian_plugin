import { ItemView, WorkspaceLeaf, Notice, setIcon, MarkdownRenderer, App, TFile } from 'obsidian';
import { LLMService } from '../llm/LLMService';
import { DataService } from '../main-page/DataService';

export const CHAT_VIEW_TYPE = 'monitoring-chat-view';

export class ChatView extends ItemView {
    llmService: LLMService;
    dataService: DataService;
    app: App;
    messages: { role: string, content: string }[] = [];
    messageContainer: HTMLDivElement;
    inputEl: HTMLTextAreaElement;
    currentNotePath: string | null = null;
    vaultSummary: string = '';

    constructor(leaf: WorkspaceLeaf, llmService: LLMService, dataService: DataService, app: App) {
        super(leaf);
        this.llmService = llmService;
        this.dataService = dataService;
        this.app = app;
    }

    getViewType() {
        return CHAT_VIEW_TYPE;
    }

    getDisplayText() {
        return 'ИИ-Чат Мониторинга';
    }

    getIcon() {
        return 'bot';
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('monitoring-chat-view');

        // Load vault summary
        try {
            this.vaultSummary = await this.dataService.getVaultSummary();
        } catch (e) {
            console.error('Failed to load vault summary:', e);
            this.vaultSummary = '# Сводка по хранилищу\n\nНе удалось загрузить данные.';
        }

        this.updateCurrentNote();

        // Header
        const header = container.createDiv('chat-header');
        header.createEl('h3', { text: 'Корпоративный ИИ-Ассистент' });

        const clearBtn = header.createEl('button', { text: 'Очистить историю', cls: 'chat-clear-btn' });
        clearBtn.onclick = () => {
            this.messages = [];
            this.renderMessages();
        };

        const refreshBtn = header.createEl('button', { text: '🔄 Обновить контекст', cls: 'chat-refresh-btn' });
        refreshBtn.onclick = async () => {
            new Notice('Обновление контекста...');
            this.vaultSummary = await this.dataService.getVaultSummary();
            this.updateCurrentNote();
            const noteName = this.currentNotePath ? this.currentNotePath.split('/').pop() : 'нет';
            new Notice(`Контекст обновлён! Текущая заметка: ${noteName}`);
        };

        // Message Container
        this.messageContainer = container.createDiv('chat-message-container');

        // Context info in header
        const contextInfo = header.createDiv('chat-context-info');
        contextInfo.setText(this.currentNotePath 
            ? 'Контекст: сводка хранилища + текущая заметка' 
            : 'Контекст: сводка хранилища');

        // Input Area
        const inputArea = container.createDiv('chat-input-area');
        
        this.inputEl = inputArea.createEl('textarea', { 
            placeholder: 'Введите ваш запрос...',
            cls: 'chat-input'
        });

        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        const sendBtn = inputArea.createEl('button', { cls: 'chat-send-btn' });
        setIcon(sendBtn, 'send');
        sendBtn.onclick = () => this.sendMessage();

        this.renderMessages();
    }

    updateCurrentNote() {
        const activeFile = this.app.workspace.getActiveFile();
        this.currentNotePath = activeFile?.path || null;
    }

    async sendMessage() {
        const text = this.inputEl.value.trim();
        if (!text) return;

        this.updateCurrentNote();
        
        // Get current note content
        let currentNoteContent = '';
        if (this.currentNotePath) {
            try {
                currentNoteContent = await this.dataService.getNoteContent(this.currentNotePath) || '';
            } catch (e) {
                console.error('Failed to read current note:', e);
            }
        }

        this.inputEl.value = '';
        
        // Show what context is being used
        let contextInfo = 'Используется контекст: сводка хранилища';
        if (this.currentNotePath) {
            contextInfo += ' + текущая заметка';
        }
        
        this.messages.push({ role: 'user', content: text });
        
        // Add context as first user message
        const contextMessage = this.buildContextMessage(currentNoteContent);
        this.messages.unshift({ role: 'user', content: contextMessage });
        
        this.renderMessages();

        // Show typing indicator
        const typingEl = this.messageContainer.createDiv('chat-message assistant typing');
        typingEl.createDiv().setText('ИИ печатает...');
        this.scrollToBottom();

        try {
            const responseText = await this.llmService.sendChatMessage(this.messages);
            typingEl.remove();
            
            // Check if AI wants to edit the note
            const editMatch = responseText.match(/<!--EDIT_NOTE:([\s\S]*?)-->/);
            if (editMatch && this.currentNotePath) {
                const newContent = editMatch[1];
                await this.dataService.updateNoteContent(this.currentNotePath, newContent);
                this.messages.push({ role: 'assistant', content: responseText.replace(editMatch[0], '✅ Заметка обновлена!') });
            } else {
                this.messages.push({ role: 'assistant', content: responseText });
            }
            this.renderMessages();
        } catch (error) {
            typingEl.remove();
            new Notice('Ошибка отправки сообщения: ' + error.message);
            console.error(error);
        }
    }

    buildContextMessage(currentNoteContent: string): string {
        let context = 'Ты - корпоративный ИИ-ассистент для работы с задачами и проектами.\n\n';
        context += '=== СВОДКА ХРАНИЛИЩА ===\n' + this.vaultSummary + '\n\n';
        
        if (currentNoteContent && this.currentNotePath) {
            context += '=== ТЕКУЩАЯ ОТКРЫТАЯ ЗАМЕТКА ===\n';
            context += `Путь: ${this.currentNotePath}\n`;
            context += `Содержание:\n${currentNoteContent}\n\n`;
            context += 'Если пользователь просит внести изменения в эту заметку, ответь полным текстом заметки с изменениями и оберни его в тег <!--EDIT_NOTE:...-->.\n';
        }
        
        context += 'Помни: отвечай на русском языке.';
        return context;
    }

    renderMessages() {
        this.messageContainer.empty();
        if (this.messages.length === 0) {
            const emptyEl = this.messageContainer.createDiv('chat-empty');
            emptyEl.setText('Здесь пока пусто. Напишите что-нибудь!');
            return;
        }

        this.messages.forEach((msg, idx) => {
            // Skip rendering context messages that start with vault summary marker
            if (idx === 0 && msg.content.includes('=== СВОДКА ХРАНИЛИЩА ===')) {
                return;
            }
            
            const msgEl = this.messageContainer.createDiv(`chat-message ${msg.role}`);
            
            // Copy button
            const copyBtn = msgEl.createDiv('chat-message-copy-btn');
            setIcon(copyBtn, 'copy');
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(msg.content);
                new Notice('Текст скопирован в буфер обмена');
            };

            const contentEl = msgEl.createDiv('chat-message-content');
            
            // If it's the assistant, render as markdown
            if (msg.role === 'assistant') {
                MarkdownRenderer.renderMarkdown(msg.content, contentEl, '', this);
            } else {
                contentEl.setText(msg.content);
            }
        });

        this.scrollToBottom();
    }

    scrollToBottom() {
        this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
    }

    async onClose() {
        // cleanup if needed
    }
}
