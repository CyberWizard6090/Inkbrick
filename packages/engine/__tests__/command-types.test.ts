import { describe, expect, expectTypeOf, it } from 'vitest';

import { Editor, type CaretResult, type CommandResult } from '@inkbrick/engine';

/*
 * Своя команда, объявленная в `CommandMap` (declaration merging): её данные и результат проверяются так же, как у
 * встроенных. Имя с префиксом теста, чтобы объявление не мешало остальному коду.
 */
declare module '@inkbrick/engine' {
  interface CommandMap {
    'test:count-words': { payload: { blockId: string }; result: number };
  }
}

/**
 * Типизация команд проверяется компилятором (`pnpm typecheck`): строки с `@ts-expect-error` обязаны давать ошибку.
 * Во время выполнения тест только убеждается, что вызовы работают.
 */
describe('typed commands', () => {
  const setup = () => {
    const editor = new Editor();
    const note = editor.document.getBlock(editor.document.rootId)!.children[0];
    const first = editor.document.getBlock(note)!.children[0];

    return { editor, first };
  };

  it('dispatch infers the result from the intent', () => {
    const { editor, first } = setup();
    const caret = editor.dispatch({
      type: 'replaceText',
      payload: { blockId: first, from: 0, to: 0, text: 'hi' },
    });

    expectTypeOf(caret).toEqualTypeOf<CaretResult | undefined>();
    expect(caret).toEqual({ blockId: first, offset: 2 });

    const nothing = editor.dispatch({ type: 'indentBlock', payload: { blockId: first } });

    expectTypeOf(nothing).toEqualTypeOf<void | undefined>();
    expectTypeOf<CommandResult<'insert-paragraph'>>().toEqualTypeOf<string>();
  });

  it('execute and can check the payload of a known command', () => {
    const { editor, first } = setup();

    expectTypeOf(editor.execute('deleteText', { blockId: first, from: 0, to: 0 })).toEqualTypeOf<
      CaretResult | undefined
    >();
    expect(editor.can('insertBlock', { flavour: 'block:paragraph', afterId: first })).toBe(true);

    // @ts-expect-error: у deleteText нет поля `text`, а `to` обязателен.
    expect(() => editor.can('deleteText', { blockId: first, from: 0, text: 'x' })).not.toThrow();
    // @ts-expect-error: опечатка в имени известной команды не уходит в нетипизированный вызов.
    expect(() => editor.dispatch({ type: 'replaceTxt', payload: {} })).toThrow('Unknown command');
  });

  it('a command of your own: typed once declared, open when not', () => {
    const { editor, first } = setup();

    editor.dispatcher.register({
      type: 'test:count-words',
      canExecute: () => true,
      execute: () => 1,
    });

    expectTypeOf(editor.execute('test:count-words', { blockId: first })).toEqualTypeOf<
      number | undefined
    >();
    expect(editor.execute('test:count-words', { blockId: first })).toBe(1);

    // @ts-expect-error: данные объявленной команды проверяются.
    editor.can('test:count-words', { id: first });

    // Не объявленная команда: имя любое, данные и результат не проверяются.
    expectTypeOf(editor.can('callout:anything', { whatever: true })).toEqualTypeOf<boolean>();
    expect(() => editor.execute('callout:anything')).toThrow('Unknown command');
  });
});
