import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@inkbrick/styles';

import { preloadLocale } from '@inkbrick/react';

import { App, publish } from './App';
import { TableDemo } from './TableDemo';
import './index.css';
import { initialLocale } from './locales';
import { restoreEditor } from './persistence';
import { applyTheme, initialTheme } from './theme';

applyTheme(initialTheme());

// ?demo=table — отдельный редактор таблицы без документа вокруг.
if (new URLSearchParams(window.location.search).get('demo') === 'table') {
  // Язык редактора грузится отдельным чанком: ждём его, чтобы страница сразу открылась на нужном языке, без английского кадра.
  void preloadLocale(initialLocale()).then(() => {
    createRoot(document.getElementById('root') as HTMLElement).render(
      <StrictMode>
        <TableDemo />
      </StrictMode>,
    );
  });
} else {
  start();
}

function start() {
  // Документ из памяти браузера читается до первой отрисовки: страница сразу открывается с ним, без мигания пустым.
  void Promise.all([restoreEditor(), preloadLocale(initialLocale())]).then(([initial]) => {
    publish(initial.editor);

    createRoot(document.getElementById('root') as HTMLElement).render(
      <StrictMode>
        <App initial={initial} />
      </StrictMode>,
    );
  });
}
