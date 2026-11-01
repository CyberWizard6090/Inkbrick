import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@inkbrick/styles';

import { App, publish } from './App';
import './index.css';
import { restoreEditor } from './persistence';
import { applyTheme, initialTheme } from './theme';

applyTheme(initialTheme());

// Документ из памяти браузера читается до первой отрисовки: страница сразу открывается с ним, без мигания пустым.
void restoreEditor().then((initial) => {
  publish(initial.editor);

  createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
      <App initial={initial} />
    </StrictMode>,
  );
});
