import { describe, expect, it, vi } from 'vitest';

import { defaultKeymap, matchesShortcut, resolveKeymap, unbind, type KeyBinding } from '../src';
import { handleKeyDown } from '../src/keymap/keymap';
import type { KeymapContext } from '../src';

type Init = Partial<
  Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>
>;

function keyEvent(init: Init & { key: string }) {
  const event = {
    code: '',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...init,
    preventDefault: vi.fn(),
  };

  return event as unknown as KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> };
}

const context = (event: KeyboardEvent) => ({ event }) as unknown as KeymapContext;

describe('matchesShortcut', () => {
  it('treats Mod as Ctrl or Cmd and compares Shift/Alt exactly', () => {
    expect(matchesShortcut(keyEvent({ key: 'b', ctrlKey: true }), 'Mod-b')).toBe(true);
    expect(matchesShortcut(keyEvent({ key: 'b', metaKey: true }), 'Mod-b')).toBe(true);
    expect(matchesShortcut(keyEvent({ key: 'b' }), 'Mod-b')).toBe(false);
    expect(matchesShortcut(keyEvent({ key: 'b', ctrlKey: true, shiftKey: true }), 'Mod-b')).toBe(
      false,
    );
    expect(matchesShortcut(keyEvent({ key: 'b', ctrlKey: true, altKey: true }), 'Mod-b')).toBe(
      false,
    );
  });

  it('is case-insensitive for the key (Shift makes event.key uppercase)', () => {
    expect(
      matchesShortcut(keyEvent({ key: 'Z', ctrlKey: true, shiftKey: true }), 'Mod-Shift-z'),
    ).toBe(true);
    expect(matchesShortcut(keyEvent({ key: 'Tab', shiftKey: true }), 'Shift-tab')).toBe(true);
  });

  it('does not let plain keys match when Ctrl or Cmd is pressed', () => {
    expect(matchesShortcut(keyEvent({ key: 'Tab' }), 'Tab')).toBe(true);
    expect(matchesShortcut(keyEvent({ key: 'Tab', ctrlKey: true }), 'Tab')).toBe(false);
    expect(matchesShortcut(keyEvent({ key: 'Tab', shiftKey: true }), 'Tab')).toBe(false);
  });

  it('supports explicit Ctrl/Meta/Alt, aliases and special keys', () => {
    expect(matchesShortcut(keyEvent({ key: 'a', ctrlKey: true }), 'Ctrl-a')).toBe(true);
    expect(matchesShortcut(keyEvent({ key: 'a', metaKey: true }), 'Ctrl-a')).toBe(false);
    expect(matchesShortcut(keyEvent({ key: 'a', metaKey: true }), 'Cmd-a')).toBe(true);
    expect(matchesShortcut(keyEvent({ key: '0', altKey: true, ctrlKey: true }), 'Mod-Alt-0')).toBe(
      true,
    );
    expect(matchesShortcut(keyEvent({ key: 'Escape' }), 'Esc')).toBe(true);
    expect(matchesShortcut(keyEvent({ key: ' ' }), 'Space')).toBe(true);
    expect(matchesShortcut(keyEvent({ key: 'ArrowDown' }), 'Down')).toBe(true);
    expect(matchesShortcut(keyEvent({ key: '-', ctrlKey: true }), 'Mod--')).toBe(true);
  });

  it('matches letters by physical key on a non-Latin layout', () => {
    // Русская раскладка: Ctrl+B даёт key «и», code KeyB.
    expect(matchesShortcut(keyEvent({ key: 'и', code: 'KeyB', ctrlKey: true }), 'Mod-b')).toBe(
      true,
    );
    expect(matchesShortcut(keyEvent({ key: 'я', code: 'KeyZ', ctrlKey: true }), 'Mod-z')).toBe(
      true,
    );
    // Латинская раскладка с другой физической клавишей (Dvorak): решает key, а не code.
    expect(matchesShortcut(keyEvent({ key: 'x', code: 'KeyB', ctrlKey: true }), 'Mod-b')).toBe(
      false,
    );
  });

  it('rejects a shortcut without a key', () => {
    expect(() => matchesShortcut(keyEvent({ key: 'a' }), 'Mod-')).toThrow('no key');
  });
});

describe('defaultKeymap', () => {
  it('has unique ids', () => {
    const ids = defaultKeymap.map((binding) => binding.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('puts slash-menu bindings before everything else', () => {
    const firstOther = defaultKeymap.findIndex((binding) => !binding.id.startsWith('slash.'));

    expect(defaultKeymap.slice(0, firstOther).every((binding) => binding.when)).toBe(true);
    expect(defaultKeymap.slice(firstOther).some((binding) => binding.id.startsWith('slash.'))).toBe(
      false,
    );
  });

  it('keeps the shortcuts the editor shipped with', () => {
    const keys = Object.fromEntries(
      defaultKeymap.map((binding) => [binding.id, [binding.keys].flat()]),
    );

    expect(keys['undo']).toEqual(['Mod-z']);
    expect(keys['redo']).toEqual(['Mod-Shift-z', 'Mod-y']);
    expect(keys['format.bold']).toEqual(['Mod-b']);
    expect(keys['format.strike']).toEqual(['Mod-Shift-x']);
    expect(keys['indent']).toEqual(['Tab', 'Shift-Tab']);
  });
});

describe('resolveKeymap', () => {
  const noop = () => undefined;

  it('returns the defaults untouched when nothing is custom', () => {
    expect(resolveKeymap()).toBe(defaultKeymap);
    expect(resolveKeymap([])).toBe(defaultKeymap);
  });

  it('puts new bindings first and lets a same-id binding replace a default in place', () => {
    const added: KeyBinding = { id: 'save', keys: 'Mod-s', run: noop };
    const replaced: KeyBinding = { id: 'format.bold', keys: 'Mod-Alt-b', run: noop };
    const result = resolveKeymap([added, replaced]);

    expect(result[0]).toBe(added);
    expect(result).toHaveLength(defaultKeymap.length + 1);

    const index = defaultKeymap.findIndex((binding) => binding.id === 'format.bold');

    expect(result[index + 1]).toBe(replaced);
  });

  it('unbind disables a default binding', () => {
    const result = resolveKeymap([unbind('format.strike')]);
    const binding = result.find((item) => item.id === 'format.strike')!;

    expect(binding.keys).toEqual([]);
    expect(
      handleKeyDown(result, context(keyEvent({ key: 'X', ctrlKey: true, shiftKey: true }))),
    ).toBe(false);
  });
});

describe('handleKeyDown', () => {
  it('runs the first matching binding and prevents default', () => {
    const first = vi.fn();
    const second = vi.fn();
    const event = keyEvent({ key: 's', ctrlKey: true });
    const handled = handleKeyDown(
      [
        { id: 'a', keys: 'Mod-s', run: first },
        { id: 'b', keys: 'Mod-s', run: second },
      ],
      context(event),
    );

    expect(handled).toBe(true);
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('continues to the next binding when run returns false, without preventing default', () => {
    const second = vi.fn();
    const event = keyEvent({ key: 's', ctrlKey: true });

    handleKeyDown(
      [
        { id: 'a', keys: 'Mod-s', run: () => false },
        { id: 'b', keys: 'Mod-s', run: second },
      ],
      context(event),
    );

    expect(second).toHaveBeenCalledOnce();

    const pass = keyEvent({ key: 's', ctrlKey: true });

    expect(handleKeyDown([{ id: 'a', keys: 'Mod-s', run: () => false }], context(pass))).toBe(
      false,
    );
    expect(pass.preventDefault).not.toHaveBeenCalled();
  });

  it('skips a binding whose "when" is false and ignores unrelated keys', () => {
    const run = vi.fn();
    const event = keyEvent({ key: 's', ctrlKey: true });

    expect(
      handleKeyDown([{ id: 'a', keys: 'Mod-s', when: () => false, run }], context(event)),
    ).toBe(false);
    expect(handleKeyDown([{ id: 'a', keys: 'Mod-q', run }], context(event))).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('treats a binding with an empty key list as disabled', () => {
    const run = vi.fn();

    expect(handleKeyDown([{ id: 'a', keys: [], run }], context(keyEvent({ key: 'a' })))).toBe(
      false,
    );
    expect(run).not.toHaveBeenCalled();
  });
});
