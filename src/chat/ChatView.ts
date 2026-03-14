import { ItemView, WorkspaceLeaf, Notice, setIcon, MarkdownRenderer } from 'obsidian';
import { LLMService } from '../llm/LLMService';

export const CHAT_VIEW_TYPE = 'monitoring-chat-view';

export class ChatView extends ItemView {
    llmService: LLMService;
    messages: { role: string, content: string }[] = [];
    messageContainer: HTMLDivElement;
    inputEl: HTMLTextAreaElement;

    constructor(leaf: WorkspaceLeaf, llmService: LLMService) {
        super(leaf);
        this.llmService = llmService;
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

        // Header
        const header = container.createDiv('chat-header');
        header.createEl('h3', { text: 'Корпоративный ИИ-Ассистент' });

        const clearBtn = header.createEl('button', { text: 'Очистить историю', cls: 'chat-clear-btn' });
        clearBtn.onclick = () => {
            this.messages = [];
            this.renderMessages();
        };

        // Message Container
        this.messageContainer = container.createDiv('chat-message-container');

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

    async sendMessage() {
        const text = this.inputEl.value.trim();
        if (!text) return;

        this.inputEl.value = '';
        this.messages.push({ role: 'user', content: text });
        this.renderMessages();

        // Show typing indicator
        const typingEl = this.messageContainer.createDiv('chat-message assistant typing');
        typingEl.createDiv().setText('ИИ печатает...');
        this.scrollToBottom();

        try {
            const responseText = await this.llmService.sendChatMessage(this.messages);
            typingEl.remove();
            
            this.messages.push({ role: 'assistant', content: responseText });
            this.renderMessages();
        } catch (error) {
            typingEl.remove();
            new Notice('Ошибка отправки сообщения: ' + error.message);
            console.error(error);
        }
    }

    renderMessages() {
        this.messageContainer.empty();
        if (this.messages.length === 0) {
            const emptyEl = this.messageContainer.createDiv('chat-empty');
            emptyEl.setText('Здесь пока пусто. Напишите что-нибудь!');
            return;
        }

        this.messages.forEach(msg => {
            const msgEl = this.messageContainer.createDiv(`chat-message ${msg.role}`);
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
