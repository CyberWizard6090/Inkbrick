import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@inkbrick/styles';

import '../index.css';
import './collab.css';
import { CollabDemo } from './CollabDemo';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <CollabDemo />
  </StrictMode>,
);
