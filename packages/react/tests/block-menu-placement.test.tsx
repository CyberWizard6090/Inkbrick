import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { DefaultBlockMenu } from '../src/block-handle/DefaultBlockMenu';
import type { BlockMenuAction } from '../src/block-handle/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const actions: BlockMenuAction[] = [{ id: 'one', title: 'One', run: () => undefined }];

function place(y: number, innerHeight: number, menuHeight: number) {
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(innerHeight);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(menuHeight);

  const { getByTestId } = render(
    <DefaultBlockMenu
      block={{ id: 'b', flavour: 'block:table', props: {}, content: [], children: [] } as never}
      position={{ x: 10, y }}
      actions={actions}
      turnInto={[]}
      onClose={() => undefined}
    />,
  );

  return getByTestId('block-menu');
}

describe('block menu placement', () => {
  it('shifts up to stay in the window when it fits neither below nor above the handle', () => {
    // Окно 300, меню 180, ручка на 150: снизу не хватает (330 > 300), сверху тоже (150 - 180 < 0).
    const menu = place(150, 300, 180);

    expect(parseFloat(menu.style.top)).toBeLessThanOrEqual(300 - 180 - 8);
    expect(parseFloat(menu.style.top)).toBeGreaterThanOrEqual(8);
  });

  it('opens right under the handle when there is room', () => {
    expect(parseFloat(place(40, 600, 180).style.top)).toBe(40);
  });

  it('opens above the handle when below does not fit but above does', () => {
    const menu = place(500, 600, 180);

    expect(menu.getAttribute('data-side')).toBe('top');
  });
});
