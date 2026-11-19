# Сборка редактора

Этот каталог содержит исходник и закреплённые зависимости локального редактора конфигураций. Готовый модуль включён в `ui/config-editor.js`; внешних CDN нет.

Из корня проекта:

```sh
npm ci --prefix tools/editor
node tools/editor/node_modules/esbuild/bin/esbuild tools/editor/editor.js --bundle --format=esm --minify --define:global=globalThis --outfile=ui/config-editor.js
```

CodeMirror и парсеры проверяют синтаксис, а не соответствие конфигурации правилам конкретного плагина.
