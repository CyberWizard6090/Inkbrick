import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@inkbrick/styles';

import { App, publish } from './App';
import { TableDemo } from './TableDemo';
import './index.css';
import { restoreEditor } from './persistence';
import { applyTheme, initialTheme } from './theme';

applyTheme(initialTheme());

// ?demo=table — отдельный редактор таблицы без документа вокруг.
if (new URLSearchParams(window.location.search).get('demo') === 'table') {
  createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
      <TableDemo />
    </StrictMode>,
  );
} else {
  start();
}

function start() {
  // Документ из памяти браузера читается до первой отрисовки: страница сразу открывается с ним, без мигания пустым.
  void restoreEditor().then((initial) => {
    publish(initial.editor);

    createRoot(document.getElementById('root') as HTMLElement).render(
      <StrictMode>
        <App initial={initial} />
      </StrictMode>,
    );
  });
}
