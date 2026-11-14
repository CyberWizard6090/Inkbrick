import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { DocumentView, EditorProvider } from '@inkbrick/react';

import { useCollabState, useEditorWiring } from './CollabDemo';
import { COLORS, openServerPeer, setupDemo, type ServerPeer, type ServerSetup } from './serverMode';

const URL_KEY = 'inkbrick.collab.server';

function useConnection(peer: ServerPeer) {
  const key = useSyncExternalStore(
    (listener) => peer.connection.subscribe(listener),
    () =>
      [
        peer.connection.status,
        peer.connection.canWrite,
        ...peer.connection.peers.map((other) => `${other.conn}:${JSON.stringify(other.state)}`),
      ].join('|'),
  );

  return { key, connection: peer.connection };
}

function ServerPeerPanel({
  peer,
  accent,
  mine,
}: {
  peer: ServerPeer;
  accent: string;
  mine: string;
}) {
  const { collab, editor } = peer;
  const root = useRef<HTMLDivElement>(null);
  const state = useCollabState(collab, editor);
  const { key, connection } = useConnection(peer);
  const [offline, setOffline] = useState(false);

  useEditorWiring(root, collab);

  // Where this person is: the block of their caret goes to the others as awareness.
  useEffect(() => {
    let last = '';
    const onSelection = (): void => {
      const node = document.getSelection()?.anchorNode;
      const element = node instanceof Element ? node : node?.parentElement;
      const block = element?.closest('[data-block-id]');

      if (!block || !root.current?.contains(block)) return;

      const id = block.getAttribute('data-block-id') ?? '';

      if (id === last) return;

      last = id;
      connection.setAwareness({ block: id, color: accent, name: peer.person.name });
    };

    document.addEventListener('selectionchange', onSelection);

    return () => document.removeEventListener('selectionchange', onSelection);
  }, [connection, accent, peer.person.name]);

  // Where the others are: their block gets a bar in their color and their name.
  useEffect(() => {
    const element = root.current;

    if (!element) return undefined;

    const apply = (): void => {
      element.querySelectorAll<HTMLElement>('[data-remote-user]').forEach((marked) => {
        marked.removeAttribute('data-remote-user');
        marked.style.removeProperty('--remote-color');
      });

      for (const other of connection.peers) {
        const where = other.state as { block?: string; color?: string; name?: string } | null;

        if (!where?.block) continue;

        const block = element.querySelector<HTMLElement>(
          `[data-block-id="${CSS.escape(where.block)}"]`,
        );

        block?.setAttribute('data-remote-user', where.name ?? other.user.username);
        block?.style.setProperty('--remote-color', where.color ?? '#888');
      }
    };

    apply();

    const observer = new MutationObserver(apply);

    observer.observe(element, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [connection, key]);

  const status = connection.status;
  const online = status === 'online';

  return (
    <section className="peer" style={{ ['--peer-accent' as string]: accent }}>
      <header className="peer-head">
        <h2>{peer.person.name}</h2>
        <span
          className={online ? 'pill ok' : 'pill off'}
          data-testid={`${peer.person.name}-status`}
        >
          {online
            ? 'в сети'
            : status === 'connecting'
              ? 'подключение'
              : status === 'reconnecting'
                ? 'переподключение'
                : 'нет связи'}
        </span>
        <span
          className={state.inSync ? 'pill ok' : 'pill bad'}
          title="Экран совпадает с проекцией Y.Doc"
        >
          {state.inSync ? 'экран = Y.Doc' : 'расхождение'}
        </span>
        {!connection.canWrite && <span className="pill off">только чтение</span>}
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
            if (offline) connection.connect();
            else connection.close();

            setOffline(!offline);
          }}
        >
          {offline ? 'Вернуть связь' : 'Обрыв'}
        </button>
        <span className="here" aria-label="Кто в документе">
          {connection.peers.length === 0 ? 'в документе только вы' : 'рядом:'}
          {connection.peers.map((other) => {
            const where = other.state as { color?: string; name?: string } | null;

            return (
              <span
                key={other.conn}
                className="who"
                style={{ ['--who' as string]: where?.color ?? '#888' }}
              >
                {where?.name ?? other.user.username}
              </span>
            );
          })}
        </span>
      </div>
      <p className="mine">{mine}</p>
      <div className="peer-editor" ref={root}>
        <EditorProvider editor={editor}>
          <DocumentView />
        </EditorProvider>
      </div>
    </section>
  );
}

export function ServerDemo() {
  const [url, setUrl] = useState(() => {
    try {
      return localStorage.getItem(URL_KEY) ?? 'http://127.0.0.1:8081';
    } catch {
      return 'http://127.0.0.1:8081';
    }
  });
  const [phase, setPhase] = useState<'form' | 'loading' | 'ready'>('form');
  const [message, setMessage] = useState('');
  const [setup, setSetup] = useState<ServerSetup>();
  const [peers, setPeers] = useState<ServerPeer[]>([]);

  const start = async (): Promise<void> => {
    setPhase('loading');
    setMessage('');

    try {
      localStorage.setItem(URL_KEY, url);
    } catch {
      // The address is only remembered for convenience.
    }

    try {
      const created = await setupDemo(url);
      const errors = (error: Error): void => setMessage(error.message);
      const opened = await Promise.all(
        created.people.map((person) => openServerPeer(created, person, errors)),
      );

      setSetup(created);
      setPeers(opened);
      setPhase('ready');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setPhase('form');
    }
  };

  useEffect(() => () => peers.forEach((peer) => peer.connection.destroy()), [peers]);

  if (phase !== 'ready' || !setup) {
    return (
      <main className="collab">
        <h1>Совместное редактирование на сервере</h1>
        <p className="lead">
          Два пользователя открывают один документ Rabbit Hole по WebSocket. Нужен запущенный сервер
          с миграциями блокнотов и адресом этой страницы в <code>ALLOWED_ORIGINS</code>. Кнопка
          создаёт двух пользователей, рабочее пространство, блокнот и документ (регистрация
          ограничена: примерно раз в минуту).
        </p>
        <form
          className="net"
          onSubmit={(event) => {
            event.preventDefault();
            void start();
          }}
        >
          <label>
            Адрес сервера
            <input
              type="url"
              value={url}
              required
              onChange={(event) => setUrl(event.target.value)}
              data-testid="server-url"
              style={{ minWidth: 260 }}
            />
          </label>
          <button type="submit" disabled={phase === 'loading'} data-testid="server-start">
            {phase === 'loading' ? 'Создаю демо…' : 'Создать демо и подключиться'}
          </button>
        </form>
        {message && (
          <p role="alert" className="pill bad">
            {message}
          </p>
        )}
      </main>
    );
  }

  return (
    <main className="collab">
      <h1>Совместное редактирование на сервере</h1>
      <p className="lead">
        Документ №{setup.documentId} на {setup.baseUrl}. Поставьте курсор в блок: у другого
        редактора он подсветится вашим цветом.
      </p>
      {message && (
        <p role="alert" className="pill bad">
          {message}
        </p>
      )}
      <div className="peers">
        {peers.map((peer, index) => (
          <ServerPeerPanel
            key={peer.person.id}
            peer={peer}
            accent={COLORS[index]}
            mine={`Вы: ${peer.person.name}, пользователь №${peer.person.id}`}
          />
        ))}
      </div>
    </main>
  );
}
