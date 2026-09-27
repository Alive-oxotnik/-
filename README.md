# Скиллы Claude для фронтенда

Набор из 9 скиллов для Claude Code и claude.ai: от создания проекта до проверки
вёрстки в браузере, доступности и скорости загрузки. Ставится двумя командами.

Скилл — это папка с инструкцией `SKILL.md` (иногда со скриптами). Claude сам
подключает нужный скилл, когда задача подходит: «сделай лендинг», «почему страница
тормозит», «проверь, как выглядит на телефоне».

## Что внутри

| Скилл | Что делает | Автор |
|---|---|---|
| `frontend-setup` | Создаёт проект (Vite + React + TypeScript, Next.js или Astro) без интерактивных вопросов, подключает Tailwind, линтер, Prettier, Vitest, Playwright и алиасы, проверяет сборку | этот репозиторий |
| `react-typescript` | React 19 + TypeScript: типизация пропсов, где хранить состояние, когда нужен `useEffect`, загрузка данных (TanStack Query), формы (`useActionState`, react-hook-form + zod), тесты. Примеры кода проверены компилятором и тестами | этот репозиторий |
| `tailwind-css` | Tailwind CSS v4: `@theme`, семантические токены, тёмная тема, контейнерные запросы, `cn()`; таблица отличий v3 → v4 | этот репозиторий |
| `web-accessibility` | Доступность по WCAG 2.2 AA: семантика, клавиатура, фокус, формы, контраст. Скрипт аудита на axe-core и проверка порядка Tab | этот репозиторий |
| `webapp-testing` | Claude сам открывает приложение в браузере: скриншоты для телефона и десктопа, ошибки консоли, упавшие запросы, битые картинки, горизонтальный скролл; e2e-тесты на Playwright | этот репозиторий |
| `web-performance` | Замер Core Web Vitals (LCP, CLS, TBT) скриптом с мобильным троттлингом и способы исправления | этот репозиторий |
| `frontend-design` | Дизайн с характером вместо «шаблонного AI-вида»: визуальное направление, типографика, палитра, самопроверка по скриншотам | Anthropic, Apache 2.0 |
| `web-artifacts-builder` | Сложные HTML-артефакты для claude.ai на React + Tailwind + shadcn/ui | Anthropic, Apache 2.0 |
| `theme-factory` | 10 готовых тем (цвета и шрифты) для страниц, слайдов и документов | Anthropic, Apache 2.0 |

Тексты скиллов на английском, как принято для скиллов. Общаться с Claude при этом
можно на русском.

## Установка

### Вариант 1. Claude Code, плагином (рекомендуется)

В Claude Code (терминал, VS Code, JetBrains, десктоп-приложение) выполните по очереди:

```
/plugin marketplace add Alive-oxotnik/-
/plugin install frontend-skills@oxotnik-skills
```

Если короткий адрес не сработает, укажите полный:
`/plugin marketplace add https://github.com/Alive-oxotnik/-.git`

То же из обычного терминала:

```bash
claude plugin marketplace add Alive-oxotnik/-
claude plugin install frontend-skills@oxotnik-skills
```

Скиллы ставятся для всех проектов сразу. Команды на потом:

- обновить: `claude plugin marketplace update oxotnik-skills`, затем `claude plugin update frontend-skills@oxotnik-skills`
- удалить: `claude plugin uninstall frontend-skills@oxotnik-skills`
- вызвать скилл вручную: `/frontend-skills:webapp-testing` (и так далее по именам из таблицы)

### Вариант 2. Вручную, в `~/.claude/skills`

```bash
git clone https://github.com/Alive-oxotnik/-.git frontend-skills
cd frontend-skills
./install.sh
```

Windows (PowerShell):

```powershell
git clone https://github.com/Alive-oxotnik/-.git frontend-skills
cd frontend-skills
powershell -ExecutionPolicy Bypass -File install.ps1
```

Скрипт копирует папки из `skills/` в `~/.claude/skills/` (на Windows —
`%USERPROFILE%\.claude\skills`). Скиллы с такими же именами, которые уже есть у
вас, он не трогает; чтобы перезаписать их, добавьте `--force` (на Windows `-Force`).
Без git можно скачать архив репозитория (Code → Download ZIP) и скопировать папки
из `skills/` вручную. Вызов вручную: `/webapp-testing` и т. д.

### Вариант 3. claude.ai (сайт и приложение Claude)

1. Скачайте архивы нужных скиллов из папки [`dist/`](dist) — по одному на скилл.
2. На claude.ai откройте настройки, найдите раздел Skills и загрузите архив
   (кнопка вроде «Upload skill»; названия пунктов меню со временем меняются).
   Для скиллов должно быть включено выполнение кода (Code execution).
3. Загруженные так скиллы работают в чатах claude.ai и подтягиваются в облачные
   сессии Claude Code.

Скрипты из `webapp-testing`, `web-accessibility` и `web-performance` запускают
браузер, поэтому полноценно работают в Claude Code (на компьютере или в облаке).
В чате claude.ai от этих скиллов пользу дают в основном инструкции.

## Что нужно для скриптов

- Node.js 20+.
- Playwright: в проекте `npm i -D playwright`, затем `npx playwright install chromium`.
  Если Chrome или Chromium уже установлен, скрипты найдут его сами; путь можно
  задать переменной `CHROMIUM_PATH`.
- Для аудита доступности: `npm i -D axe-core`.

Примеры запуска (Claude делает это сам, но можно и руками):

```bash
node skills/webapp-testing/scripts/snap.cjs http://localhost:5173 --dark
node skills/web-accessibility/scripts/a11y-audit.cjs http://localhost:5173 --tab 20
node skills/web-performance/scripts/vitals.cjs http://localhost:4173
```

У каждого скрипта есть `--help`.

## Стандартные скиллы Claude (docx, xlsx, pptx, pdf и другие)

Помимо этого набора, у автора в аккаунте включены встроенные скиллы Anthropic:
docs, deep-research, skill-creator, docx, xlsx, pptx, pdf, computer-use,
chrome-browser, built-in-browser, import-memory, morning. Копировать их не нужно,
да и лицензия это запрещает: они встроены в Claude и включаются в настройках
claude.ai, в разделе Skills.

## Структура

```
.claude-plugin/          манифесты плагина и маркетплейса (для /plugin install)
skills/<имя>/SKILL.md    скиллы (+ references/ со справкой, scripts/ со скриптами)
dist/*.zip               архивы для загрузки в claude.ai
install.sh, install.ps1  ручная установка в ~/.claude/skills
scripts/build_dist.py    пересобрать dist/ после правок
```

## Как дорабатывать

В шапке `SKILL.md` есть поле `description`: по нему Claude решает, когда подключить
скилл. Ниже идут сами инструкции. После правок:

1. `python3 scripts/build_dist.py` — пересобрать архивы для claude.ai;
2. поднять `version` в `.claude-plugin/plugin.json` и `.claude-plugin/marketplace.json`,
   чтобы у тех, кто поставил плагин, подтянулось обновление;
3. `claude plugin validate --strict .` — проверить манифесты и скиллы.

Новые скиллы удобно делать встроенным скиллом `skill-creator`.

## Лицензии

`frontend-design`, `web-artifacts-builder` и `theme-factory` — © Anthropic, PBC,
Apache License 2.0 (полный текст в `LICENSE.txt` внутри каждой папки). Скопированы
без изменений. Остальные скиллы написаны для этого репозитория.
