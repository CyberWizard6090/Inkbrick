import { createSchemaRegistry } from '@inkbrick/document';
import { Editor } from '@inkbrick/engine';
import {
  DocumentConnection,
  indexedDbPendingStore,
  openDocument,
  type Collab,
} from '@inkbrick/collab';

export interface ServerPerson {
  name: string;
  token: string;
  id: number;
}

export interface ServerSetup {
  baseUrl: string;
  documentId: number;
  people: [ServerPerson, ServerPerson];
}

async function call<T = Record<string, unknown>>(
  base: string,
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${base.replace(/\/+$/, '')}/api/v1${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as { data?: T; error?: { code?: string } };

  if (!response.ok)
    throw new Error(`${method} ${path}: ${response.status} ${json.error?.code ?? ''}`.trim());

  return json.data as T;
}

async function signUp(base: string, name: string): Promise<ServerPerson> {
  const email = `${name.toLowerCase()}-${Date.now().toString(36)}@demo.test`;

  await call(base, 'POST', '/auth/register', '', { email, password: 'password-123' });

  const { access_token: token } = await call<{ access_token: string }>(
    base,
    'POST',
    '/auth/login',
    '',
    {
      email,
      password: 'password-123',
    },
  );
  const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as {
    user_id: number;
  };

  return { name, token, id: payload.user_id };
}

/**
 * Prepares a demo on a development server: two new users who share a workspace, a notebook and one document.
 * Registration is rate limited (5 per minute per address), so this works about once a minute.
 */
export async function setupDemo(baseUrl: string): Promise<ServerSetup> {
  const ann = await signUp(baseUrl, 'Анна');
  const boris = await signUp(baseUrl, 'Борис');
  const workspace = (
    await call<{ id: number }>(baseUrl, 'POST', '/workspaces', ann.token, { name: 'Демо' })
  ).id;

  await call(baseUrl, 'POST', '/contacts', ann.token, { contact_id: boris.id });
  await call(baseUrl, 'POST', `/contacts/requests/${ann.id}/accept`, boris.token);
  await call(baseUrl, 'POST', `/workspaces/${workspace}/members`, ann.token, {
    user_id: boris.id,
    role: 'Member',
  });

  const notebook = (
    await call<{ id: number }>(baseUrl, 'POST', `/workspaces/${workspace}/notebooks`, ann.token, {
      name: 'Заметки',
    })
  ).id;
  const document = (
    await call<{ id: number }>(baseUrl, 'POST', `/notebooks/${notebook}/documents`, ann.token, {
      title: 'Общий документ',
    })
  ).id;

  return { baseUrl, documentId: document, people: [ann, boris] };
}

export interface ServerPeer {
  person: ServerPerson;
  collab: Collab;
  editor: Editor;
  connection: DocumentConnection;
}

/** Opens the document for one person: loads the state, creates the editor and starts the connection. */
export async function openServerPeer(
  setup: ServerSetup,
  person: ServerPerson,
  onError: (error: Error) => void,
): Promise<ServerPeer> {
  const schema = createSchemaRegistry();
  const { collab, connection } = await openDocument({
    baseUrl: setup.baseUrl,
    getToken: () => person.token,
    documentId: setup.documentId,
    schema,
    undoCaptureMs: 700,
    // Edits not yet acknowledged by the server survive a reload of the page.
    pendingStore: indexedDbPendingStore({ scope: `${person.id}:${setup.documentId}` }),
    onError,
  });
  // Inkbrick's own history reverts whole blocks and would erase other people's edits: undo goes through Yjs.
  const editor = new Editor({ schema, document: collab.createDocument(), history: { limit: 0 } });

  collab.attach(editor.store);
  connection.connect();

  return { person, collab, editor, connection };
}

export const COLORS = ['#2f6fed', '#d9531e'];

const SETUP_KEY = 'inkbrick.collab.setup';

/** The demo users are new on every start; the session is kept per tab so that a reload resumes the same document. */
export function saveSetup(setup: ServerSetup): void {
  try {
    sessionStorage.setItem(SETUP_KEY, JSON.stringify(setup));
  } catch {
    // Without storage a reload starts a new demo.
  }
}

export function loadSetup(): ServerSetup | undefined {
  try {
    const raw = sessionStorage.getItem(SETUP_KEY);

    return raw ? (JSON.parse(raw) as ServerSetup) : undefined;
  } catch {
    return undefined;
  }
}

export function forgetSetup(): void {
  try {
    sessionStorage.removeItem(SETUP_KEY);
  } catch {
    // Nothing to forget.
  }
}
