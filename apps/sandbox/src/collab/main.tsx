import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';

import '@inkbrick/styles';

import '../index.css';
import './collab.css';
import { CollabDemo } from './CollabDemo';
import { ServerDemo } from './ServerDemo';

type Mode = 'memory' | 'server';

function Root() {
  const [mode, setMode] = useState<Mode>(() => (location.hash === '#server' ? 'server' : 'memory'));
  const choose = (next: Mode): void => {
    location.hash = next === 'server' ? 'server' : 'memory';
    setMode(next);
  };

  return (
    <>
      <nav className="modes" aria-label="Режим демо">
        <button type="button" aria-pressed={mode === 'memory'} onClick={() => choose('memory')}>
          Сеть в памяти
        </button>
        <button
          type="button"
          aria-pressed={mode === 'server'}
          onClick={() => choose('server')}
          data-testid="mode-server"
        >
          Сервер
        </button>
      </nav>
      {mode === 'memory' ? <CollabDemo /> : <ServerDemo />}
    </>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
