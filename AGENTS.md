# AGENTS.md — Инструкции для AI-агента

## Проект: Monitoring Plugin v1.2.0
**Репозиторий:** https://github.com/D-Bykovskiy/Obsidian_plugin  
**Vault для тестирования:** `C:\Users\talyu\Desktop\Obsidian_OMIS`

---

## Архитектура проекта

### Стек технологий
- **Язык:** TypeScript → JavaScript (esbuild)
- **Фреймворк:** Obsidian API (плагин для десктопа)
- **Python:** win32com для Outlook
- **LLM:** OpenAI-compatible API

### Структура файлов
```
src/
├── main.ts              # Точка входа, регистрация ribbon/commands
├── main-page/           # Dashboard, Kanban, Calendar, Notes views
├── llm/                 # LLMService — API вызовы
├── notes/               # TemplateManager — шаблоны заметок
├── outlook/             # fetch_mail.py — Outlook интеграция
├── settings/            # SettingsTab — UI настроек
└── chat/                # ChatView — AI чат
```

---

## Ключевые файлы для изучения

| Файл | Назначение | Когда смотреть |
|------|------------|----------------|
| `src/main.ts` | Инициализация, ribbon-кнопки, команды | Всегда первым |
| `src/main-page/MainPageView.ts` | UI дашборда, канбан, календарь | UI/UX задачи |
| `src/llm/LLMService.ts` | LLM API | Интеграция с ИИ |
| `src/notes/TemplateManager.ts` | Шаблоны заметок | Работа с заметками |
| `src/outlook/fetch_mail.py` | Python Outlook | Почтовый импорт |
| `src/settings/SettingsTab.ts` | Настройки | Конфигурация |
| `manifest.json` | Метаданные плагина | Версии, зависимости |
| `esbuild.config.mjs` | Сборка | Изменения в сборке |

---

## Рабочий процесс

### 1. Сборка и тестирование
```bash
npm install          # Установка зависимостей (однократно)
npm run dev          # Watch mode — авто-пересборка
npm run build        # Разовая сборка
```

**Авто-копирование:** После сборки файлы копируются в:
```
C:\Users\talyu\Desktop\Obsidian_OMIS\.obsidian\plugins\monitoring-plugin
```

### 2. Тестирование изменений
1. Запустить `npm run dev`
2. Изменить код в `src/`
3. Файлы авто-обновятся в vault
4. В Obsidian: Settings → Community Plugins → выключить/включить плагин

### 3. Пуш на GitHub
```bash
git add . && git commit -m "описание" && git push
```

---

## Типовые задачи и куда смотреть

### Добавить новую команду в ribbon
→ `src/main.ts` — функция `addRibbonIcons()`

### Изменить UI дашборда
→ `src/main-page/MainPageView.ts` — методы `renderDashboard()`, `renderKanban()` и т.д.

### Добавить новый тип заметки
→ `src/notes/TemplateManager.ts` — массив `templates`

### Интеграция с новым API
→ `src/llm/LLMService.ts` — методы `call()`, `summarize()`

### Изменить стили
→ `styles.css` — CSS переменные в `:root`

### Добавить настройку
→ `src/settings/SettingsTab.ts` + обновить типы в `main.ts`

---

## Важные особенности кода

### Settings хранение
```typescript
// Сохранение
this.saveData(data);

// Загрузка
this.loadData();
```

### Ribbon-кнопки (main.ts)
```typescript
this.addRibbonIcon('mail', 'Импорт почты', () => this.importMail());
this.addRibbonIcon('brain', 'Главная панель', () => this.openMainPage());
this.addRibbonIcon('message-circle', 'AI Чат', () => this.openChat());
```

### LLM API вызов
```typescript
// OpenAI-compatible format
POST {baseUrl}/v1/chat/completions
{
  "model": "...",
  "messages": [{"role": "user", "content": "..."}]
}
```

### Mock-режим
В `LLMService.ts` и `OutlookService.ts` есть `useMock: boolean` для тестирования без реальных API.

---

## Версионирование

| Файл | Менять при версии |
|------|------------------|
| `manifest.json` | `version` |
| `package.json` | `version` |

Пример: v1.2.0 → v1.2.1

---

## Полезные ссылки
- [Obsidian API Docs](https://docs.obsidian.md/Plugins/API)
- [BRAT Plugin](https://obsidian.md/plugins?id=obsidian42-brat) — для обновлений
