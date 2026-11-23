import { describe, expect, it } from 'vitest';

import { z, type BlockSchema } from '@inkbrick/document';

import {
  Editor,
  defineBlockCommand,
  defineBlockController,
  defineFeature,
  type NormalizeRule,
} from '@inkbrick/engine';

/*
 * Пример из docs/custom-blocks.md целиком, кроме представления React: если руководство разойдётся с API, упадёт этот тест.
 */

// 1. Схема.
type RatingProps = { stars: number; max: number };

const RatingSchema: BlockSchema = {
  flavour: 'app:rating',
  name: 'Rating',
  icon: 'star',
  version: 1,
  propsSchema: z.object({
    stars: z.number().int().min(0).default(0),
    max: z.number().int().min(1).max(10).default(5),
  }),
  allowedParents: ['role:hub'],
  allowedChildren: [],
  enter: { nextFlavour: 'block:paragraph' },
  commands: ['rating.set'],
  shortcuts: [],
  rendererHint: 'rating',
};

// 2. Команды и контроллер.
const setRating = defineBlockCommand<RatingProps, { stars: number }>({
  type: 'rating.set',
  canExecute: ({ block }, { stars }) =>
    Number.isInteger(stars) &&
    stars >= 0 &&
    stars <= block.props.max &&
    stars !== block.props.stars,
  execute: ({ setProps }, { stars }) => setProps({ stars }),
});

const ratingController = defineBlockController<RatingProps>({
  commands: [setRating],
  menuItems: [
    {
      id: 'rating.clear',
      title: 'Clear rating',
      icon: 'x',
      isDisabled: ({ can }) => !can('rating.set', { stars: 0 }),
      run: ({ execute }) => execute('rating.set', { stars: 0 }),
    },
  ],
});

// 3. Типы команды.
declare module '@inkbrick/engine' {
  interface CommandMap {
    'rating.set': { payload: { blockId: string; stars: number }; result: void };
  }
}

// 4. Нормализация: звёзд не больше максимума (после смены max или чужого патча).
const clampStars: NormalizeRule = {
  name: 'clampStars',
  flavours: ['app:rating'],
  normalize({ engine, transaction, block }) {
    const { stars, max } = block.props as RatingProps;

    if (stars <= max) return;
    engine.block.update(transaction, block.id, (rating) => ({
      ...rating,
      props: { ...rating.props, stars: max },
    }));
  },
};

// 5. Возможность целиком.
const ratingFeature = defineFeature({
  name: 'rating',
  blocks: [{ schema: RatingSchema, controller: ratingController }],
  normalizers: [clampStars],
});

describe('docs/custom-blocks.md: the rating block', () => {
  function setup() {
    const editor = new Editor({ features: [ratingFeature] });
    const note = editor.document.getBlock(editor.document.rootId)!.children[0];
    const first = editor.document.getBlock(note)!.children[0];
    const caret = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'app:rating', afterId: first },
    })!;

    return { editor, id: caret.blockId };
  }

  it('is created with default props and set by its command, one undo step', () => {
    const { editor, id } = setup();

    expect(editor.document.getBlock(id)!.props).toEqual({ stars: 0, max: 5 });

    editor.execute('rating.set', { blockId: id, stars: 4 });
    expect(editor.document.getBlock(id)!.props.stars).toBe(4);

    expect(editor.can('rating.set', { blockId: id, stars: 9 })).toBe(false);

    editor.undo();
    expect(editor.document.getBlock(id)!.props.stars).toBe(0);
  });

  it('the normalizer keeps the stars within the maximum', () => {
    const { editor, id } = setup();

    editor.execute('rating.set', { blockId: id, stars: 5 });
    editor.dispatch({ type: 'setBlockProps', payload: { blockId: id, props: { max: 3 } } });

    expect(editor.document.getBlock(id)!.props).toEqual({ stars: 3, max: 3 });
  });

  it('invalid props are refused by the schema (the command does not run)', () => {
    const { editor, id } = setup();

    // Недопустимые props отклоняются: команда не выполняется.
    expect(editor.can('setBlockProps', { blockId: id, props: { max: 50 } })).toBe(false);
    expect(editor.document.getBlock(id)!.props.max).toBe(5);
  });
});
