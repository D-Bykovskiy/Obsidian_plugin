# AGENTS.md — Инструкции для AI-агента

> **⚠️ ВАЖНО: Перед началом работы ПРОЧТИ этот файл!**
> Это инструкция по работе с проектом. Всегда сначала читай AGENTS.md, затем приступай к задаче.

**Проект:** Monitoring Plugin v1.2.0  
**Репозиторий:** https://github.com/D-Bykovskiy/Obsidian_plugin  
**Vault для тестирования:** `C:\Users\talyu\Desktop\Obsidian_OMIS`

---

## 🗂 Структура проекта

```
Plagin_omis/
├── src/
│   ├── main.ts                    # Точка входа, ribbon-кнопки, embedded UI
│   ├── main-page/                 # Dashboard, Kanban, Calendar, Notes views
│   │   ├── MainPageView.ts        # Главная панель (вкладки)
│   │   ├── DashboardView.ts       # Дашборд с метриками
│   │   ├── KanbanView.ts          # Канбан-доска (drag-and-drop)
│   │   ├── CalendarView.ts        # Календарь на неделю
│   │   ├── NotesView.ts           # Список заметок
│   │   ├── DataService.ts         # Получение данных из хранилища
│   │   ├── BaseView.ts            # Базовый класс для views
│   │   └── types.ts               # TypeScript интерфейсы
│   ├── llm/
│   │   └── LLMService.ts          # Интеграция с корпоративной LLM
│   ├── outlook/
│   │   ├── OutlookService.ts      # TypeScript-обёртка для Python
│   │   └── fetch_mail.py          # Python-скрипт (win32com) для Outlook
│   ├── notes/
│   │   └── TemplateManager.ts     # Шаблоны заметок, создание файлов
│   ├── settings/
│   │   └── SettingsTab.ts         # UI настроек плагина
│   └── chat/
│       └── ChatView.ts            # AI чат
├── manifest.json                   # Метаданные плагина
├── package.json                   # Зависимости и скрипты
├── esbuild.config.mjs            # Сборка (авто-копирует в vault)
├── styles.css                     # CSS стили (cyber-glass дизайн)
└── tsconfig.json                 # Настройки TypeScript
```

---

## 🧭 Когда и куда смотреть?

### 1. Архитектурная логика (Ядро)
**Файлы:** `src/main.ts`, `manifest.json`

Добавить новую команду/ribbon-кнопку → `src/main.ts`

### 2. UI панели (Dashboard, Kanban, Calendar, Notes)
**Файл:** `src/main-page/MainPageView.ts` + отдельные view файлы

Изменить UI дашборда, канбана, календаря → смотри соответствующий файл в `main-page/`

### 3. Бизнес-логика: Шаблоны заметок
**Файл:** `src/notes/TemplateManager.ts`

- Изменить структуру создаваемых Markdown-заметок
- Изменить алгоритм именования файлов
- Изменить папки сохранения

### 4. Бизнес-логика: Почта (Outlook)
**Файлы:** `src/outlook/fetch_mail.py`, `src/outlook/OutlookService.ts`

- Изменить правила извлечения почты
- Изменить фильтры писем
- Изменить структуру JSON ответа

### 5. Бизнес-логика: AI и LLM
**Файл:** `src/llm/LLMService.ts`

- Изменить system prompt
- Добавить новые фичи ИИ
- Изменить параметры API (temperature, max_tokens)

### 6. Пользовательский интерфейс: Настройки
**Файл:** `src/settings/SettingsTab.ts`

- Добавить новое поле настроек
- Изменить подсказки или тексты

---

## 🛠 Паттерн взаимодействия слоев (Data Flow)

```
1. Событие (клик по кнопке в main.ts)
        ↓
2. OutlookService → fetch_mail.py → JSON с письмами
        ↓
3. LLMService → суммаризация текста
        ↓
4. TemplateManager → создание/обновление Markdown файла
```

---

## ⚙️ Рабочий процесс

### Сборка и тестирование
```bash
npm install          # Установка зависимостей (однократно)
npm run dev          # Watch mode — авто-пересборка + копирование в vault
npm run build        # Разовая сборка
```

**Авто-копирование:** После сборки файлы копируются в:
```
C:\Users\talyu\Desktop\Obsidian_OMIS\.obsidian\plugins\monitoring-plugin
```

### Тестирование изменений
1. `npm run dev` — запустить watch mode
2. Изменить код в `src/`
3. Файлы авто-обновятся в хранилище
4. Obsidian: Settings → Community Plugins → выключить/включить плагин

### Пуш на GitHub
```bash
git add . && git commit -m "описание" && git push
```

---

## 📋 Код-примеры

### Ribbon-кнопки (main.ts)
```typescript
this.addRibbonIcon('mail', 'Импорт почты', () => this.importMail());
this.addRibbonIcon('brain', 'Главная панель', () => this.openMainPage());
this.addRibbonIcon('message-circle', 'AI Чат', () => this.openChat());
```

### Settings хранение
```typescript
// Сохранение
this.saveData(data);
// Загрузка
this.loadData();
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

## 📁 Типовые задачи

| Задача | Файл |
|--------|------|
| Новая ribbon-кнопка | `src/main.ts` |
| Изменить UI дашборда | `src/main-page/DashboardView.ts` |
| Изменить канбан | `src/main-page/KanbanView.ts` |
| Изменить шаблон заметки | `src/notes/TemplateManager.ts` |
| Изменить стили | `styles.css` |
| Добавить настройку | `src/settings/SettingsTab.ts` |

---

## 🔢 Версионирование

| Файл | Менять при версии |
|------|------------------|
| `manifest.json` | `version` |
| `package.json` | `version` |

Пример: v1.2.0 → v1.2.1

---

## 🐛 Известные баги

### Иконки статуса подзадач не обновляются через время после создания
**Статус:** Средний приоритет
**Файлы:** `src/notes/TemplateManager.ts`, `src/main.ts`

---

## 🔗 Полезные ссылки
- [Obsidian API Docs](https://docs.obsidian.md/Plugins/API)
- [BRAT Plugin](https://obsidian.md/plugins?id=obsidian42-brat) — для обновлений через GitHub
