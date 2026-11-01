interface Shortcut {
  mod: boolean;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

const MODIFIER = /^(mod|ctrl|control|meta|cmd|alt|option|shift)-/i;

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  space: ' ',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  del: 'delete',
  return: 'enter',
};

const cache = new Map<string, Shortcut>();

/**
 * Разбирает запись вида `Mod-Shift-z`, `Tab`, `Shift-ArrowDown`: модификаторы (`Mod`, `Ctrl`, `Meta`/`Cmd`,
 * `Alt`/`Option`, `Shift`) через дефис, затем клавиша (как `KeyboardEvent.key`, регистр не важен).
 */
function parse(spec: string): Shortcut {
  const cached = cache.get(spec);

  if (cached) return cached;

  const shortcut: Shortcut = {
    mod: false,
    ctrl: false,
    meta: false,
    alt: false,
    shift: false,
    key: '',
  };
  let rest = spec.trim();

  for (let match = MODIFIER.exec(rest); match; match = MODIFIER.exec(rest)) {
    switch (match[1].toLowerCase()) {
      case 'mod':
        shortcut.mod = true;
        break;
      case 'ctrl':
      case 'control':
        shortcut.ctrl = true;
        break;
      case 'meta':
      case 'cmd':
        shortcut.meta = true;
        break;
      case 'alt':
      case 'option':
        shortcut.alt = true;
        break;
      default:
        shortcut.shift = true;
    }

    rest = rest.slice(match[0].length);
  }

  const key = rest.toLowerCase();

  if (key === '') throw new Error(`Invalid shortcut "${spec}": no key`);

  shortcut.key = KEY_ALIASES[key] ?? key;
  cache.set(spec, shortcut);

  return shortcut;
}

function matchesKey(event: KeyboardEvent, key: string): boolean {
  const pressed = event.key.toLowerCase();

  if (pressed === key) return true;

  // Ctrl+B на русской раскладке даёт key «и»: для латинских букв сверяем физическую клавишу.
  return (
    /^[a-z]$/.test(key) && !/^[a-z]$/.test(pressed) && event.code === `Key${key.toUpperCase()}`
  );
}

/**
 * Нажата ли ровно эта комбинация: Shift и Alt должны совпадать точно; Ctrl/Meta, если не упомянуты,
 * не должны быть нажаты (`Mod` принимает любую из двух).
 */
export function matchesShortcut(event: KeyboardEvent, spec: string): boolean {
  const shortcut = parse(spec);

  if (event.shiftKey !== shortcut.shift || event.altKey !== shortcut.alt) return false;

  if (shortcut.mod) {
    if (!(event.ctrlKey || event.metaKey)) return false;
  } else if (event.ctrlKey !== shortcut.ctrl || event.metaKey !== shortcut.meta) {
    return false;
  }

  return matchesKey(event, shortcut.key);
}
