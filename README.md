# Monitoring Plugin для Obsidian

![Version](https://img.shields.io/badge/version-1.2.0-blue)
![Obsidian](https://img.shields.io/badge/Obsidian-0.15.0+-purple)
![License](https://img.shields.io/badge/license-MIT-green)

**Monitoring Plugin** — профессиональный инструмент для руководителей, превращающий Obsidian в панель управления (Dashboard). Плагин объединяет почту Outlook, корпоративный LLM и гибкость Obsidian для автоматизации мониторинга и управления задачами.

---

## Возможности

- **Интеграция с Outlook** — автоматический импорт писем и создание заметок по шаблонам
- **AI-суммаризация** — интеграция с корпоративным LLM для анализа инцидентов
- **Dashboard** — метрики в реальном времени, сводные таблицы
- **Канбан-доска** — управление задачами Drag-and-Drop
- **Календарь** — визуализация сроков на временной шкале
- **AI-Чат** — встроенный ассистент для анализа данных

---

## Установка

### Способ 1: BRAT (рекомендуется)

1. Установите плагин [BRAT](https://obsidian.md/plugins?id=obsidian42-brat) через Obsidian Community Plugins
2. В настройках BRAT нажмите "Add a beta plugin"
3. Введите: `https://github.com/D-Bykovskiy/Obsidian_plugin`
4. Включите плагин в списке Community Plugins

### Способ 2: Вручную

1. Склонируйте репозиторий:
   ```bash
   git clone https://github.com/D-Bykovskiy/Obsidian_plugin.git
   ```

2. Установите зависимости и соберите:
   ```bash
   cd Obsidian_plugin
   npm install
   npm run build
   ```

3. Скопируйте папку `monitoring-plugin` в `.obsidian/plugins/` вашего хранилища Obsidian

---

## Требования

- **Obsidian** v0.15.0 или выше
- **Windows** (плагин использует COM-автоматизацию Outlook)
- **Python 3.10+** с установленным `pywin32` (для интеграции с Outlook)
- **Outlook** (для доступа к почте)

### Установка pywin32

```bash
pip install pywin32
```

---

## Настройка

1. Откройте **Settings** → **Monitoring Plugin**
2. Укажите:
   - **LLM Base URL** — адрес вашего корпоративного LLM API
   - **LLM API Key** — ключ для авторизации
   - **LLM Model** — модель для суммаризации
3. Создайте файл `Dashboard.md` в корне хранилища и добавьте темы для отслеживания:

```yaml
---
tracked_subjects:
  - Авария
  - Релиз
  - Инцидент
---
```

---

## Использование

### Кнопки в боковой панели

| Иконка | Описание |
|--------|----------|
| 📧 | Импортировать почту из Outlook |
| 💬 | Открыть AI-Чат |
| 🧠 | Открыть главную панель проектов |

### Горячие клавиши

- `Ctrl+P` → введите название команды

### Dashboard

- **Дашборд** — обзор метрик и активных элементов
- **Канбан** — перетаскивание задач между статусами
- **Календарь** — просмотр задач на неделе
- **Заметки** — список простых заметок

---

## Дизайн

Плагин использует стиль **Aerodynamic Cyber-Glass**:
- Эффекты Glassmorphism и Neon Glow
- Адаптивная цветовая схема под тему Obsidian

---

## Лицензия

MIT © 2026 D-Bykovskiy

---

## Поддержка

Создайте [Issue](https://github.com/D-Bykovskiy/Obsidian_plugin/issues) для сообщений об ошибках или предложений.
