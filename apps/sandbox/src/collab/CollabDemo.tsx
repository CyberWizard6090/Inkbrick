import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import * as Y from 'yjs';

import { createCollab, type Collab } from '@inkbrick/collab';
import { Editor } from '@inkbrick/engine';
import { DocumentView, EditorProvider } from '@inkbrick/react';

import { MemoryNetwork, type NetworkPeer } from './network';
import { createServerState } from './seed';
import { createSandboxControllers, createSandboxSchema, customBlocks } from '../sandboxEditor';

interface Peer extends NetworkPeer {
  editor: Editor;
}

function createPeer(id: string, state: Uint8Array, network: MemoryNetwork): Peer {
  const schema = createSandboxSchema();
  const ydoc = new Y.Doc();

  Y.applyUpdate(ydoc, state, 'remote');

  const collab = createCollab({ ydoc, schema, undoCaptureMs: 700 });
  // История Inkbrick откатывает блок целиком и затёрла бы чужие правки: в совместном режиме отмена идёт через Y.UndoManager.
  const editor = new Editor({
    schema,
    document: collab.createDocument(),
    history: { limit: 0 },
    controllers: createSandboxControllers(),
  });

  collab.attach(editor.store);

  const peer: Peer = { id, ydoc, collab, editor, online: true };

  network.add(peer);

  return peer;
}

export function useCollabState(
  collab: Collab,
  editor: Editor,
): { canUndo: boolean; canRedo: boolean; inSync: boolean } {
  const key = useSyncExternalStore(
    (listener) => {
      const offHistory = collab.history.subscribe(listener);
      const offStore = editor.store.subscribe(listener);

      return () => {
        offHistory();
        offStore();
      };
    },
    () => `${collab.history.canUndo}|${collab.history.canRedo}|${collab.inSync()}`,
  );
  const [canUndo, canRedo, inSync] = key.split('|');

  return { canUndo: canUndo === 'true', canRedo: canRedo === 'true', inSync: inSync === 'true' };
}

function usePending(network: MemoryNetwork): number {
  return useSyncExternalStore(
    (listener) => network.subscribe(listener),
    () => network.pending,
  );
}

/** Ctrl+Z goes through Yjs, and an IME composition holds other people's edits until it ends. */
export function useEditorWiring(root: RefObject<HTMLElement | null>, collab: Collab): void {
  useEffect(() => {
    const element = root.current;

    if (!element) return undefined;

    const onKey = (event: KeyboardEvent): void => {
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (!mod || (key !== 'z' && key !== 'y')) return;

      event.preventDefault();
      event.stopPropagation();

      if (key === 'y' || event.shiftKey) collab.history.redo();
      else collab.history.undo();
    };
    const start = (): void => collab.setComposing(true);
    const end = (): void => collab.setComposing(false);

    element.addEventListener('keydown', onKey, true);
    element.addEventListener('compositionstart', start);
    element.addEventListener('compositionend', end);

    return () => {
      element.removeEventListener('keydown', onKey, true);
      element.removeEventListener('compositionstart', start);
      element.removeEventListener('compositionend', end);
    };
  }, [root, collab]);
}

function PeerPanel({
  peer,
  network,
  accent,
}: {
  peer: Peer;
  network: MemoryNetwork;
  accent: string;
}) {
  const { collab, editor } = peer;
  const root = useRef<HTMLDivElement>(null);
  const state = useCollabState(collab, editor);
  const [online, setOnline] = useState(peer.online);
  const [composing, setComposing] = useState(false);

  useEditorWiring(root, collab);

  return (
    <section className="peer" style={{ ['--peer-accent' as string]: accent }}>
      <header className="peer-head">
        <h2>{peer.id}</h2>
        <span className={online ? 'pill ok' : 'pill off'} data-testid={`${peer.id}-status`}>
          {online ? 'в сети' : 'обрыв'}
        </span>
        <span
          className={state.inSync ? 'pill ok' : 'pill bad'}
          title="Экран совпадает с проекцией Y.Doc"
        >
          {state.inSync ? 'экран = Y.Doc' : 'расхождение'}
        </span>
      </header>
      <div className="peer-tools">
        <button type="button" disabled={!state.canUndo} onClick={() => collab.history.undo()}>
          ↶ Отменить
        </button>
        <button type="button" disabled={!state.canRedo} onClick={() => collab.history.redo()}>
          ↷ Вернуть
        </button>
        <button
          type="button"
          onClick={() => {
            network.setOnline(peer, !online);
            setOnline(!online);
          }}
        >
          {online ? 'Обрыв' : 'Вернуть связь'}
        </button>
        <label className="check">
          <input
            type="checkbox"
            checked={composing}
            onChange={(event) => {
              setComposing(event.target.checked);
              collab.setComposing(event.target.checked);
            }}
          />
          Придержать чужие правки (как при IME)
        </label>
      </div>
      <div className="peer-editor" ref={root}>
        <EditorProvider editor={editor} blocks={customBlocks}>
          <DocumentView />
        </EditorProvider>
      </div>
    </section>
  );
}

export function CollabDemo() {
  const [network] = useState(() => new MemoryNetwork());
  const [peers] = useState(() => {
    const state = createServerState();

    return [createPeer('Анна', state, network), createPeer('Борис', state, network)];
  });
  const [latency, setLatency] = useState(network.latencyMs);
  const pending = usePending(network);

  return (
    <main className="collab">
      <h1>Совместное редактирование: прототип</h1>
      <p className="lead">
        Два редактора с отдельными Y.Doc и сетью в памяти. Источник правды — Y.Doc, экран его
        проекция.
      </p>
      <div className="net">
        <label>
          Задержка сети: <b>{latency} мс</b>
          <input
            type="range"
            min={0}
            max={3000}
            step={50}
            value={latency}
            onChange={(event) => {
              const value = Number(event.target.value);

              network.latencyMs = value;
              setLatency(value);
            }}
          />
        </label>
        <span className="pill">{pending} обновл. в пути</span>
      </div>
      <div className="peers">
        <PeerPanel peer={peers[0]} network={network} accent="#2f6fed" />
        <PeerPanel peer={peers[1]} network={network} accent="#d9531e" />
      </div>
    </main>
  );
}
