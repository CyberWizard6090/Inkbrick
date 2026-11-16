import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { act, render } from '@testing-library/react';

import { lazyModule, preloadEditorUI, useLazy } from '../src/ui/lazy';

describe('lazy parts of the interface', () => {
  it('renders nothing until the chunk arrives, then the loaded component; loads once', async () => {
    let resolve!: (value: () => ReactElement) => void;
    const load = vi.fn(
      () =>
        new Promise<() => ReactElement>((done) => {
          resolve = done;
        }),
    );
    const module = lazyModule(load);

    function Host() {
      const Loaded = useLazy(module);

      return Loaded ? <Loaded /> : <span>waiting</span>;
    }

    const view = render(
      <>
        <Host />
        <Host />
      </>,
    );

    expect(view.container.textContent).toBe('waitingwaiting');
    expect(load).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve(() => <b>ready</b>);
      await module.preload();
    });

    expect(view.container.textContent).toBe('readyready');
    expect(module.get()).toBeDefined();
  });

  it('does not start loading while disabled', () => {
    const load = vi.fn(() => Promise.resolve(1));
    const module = lazyModule(load);

    function Host() {
      useLazy(module, false);

      return null;
    }

    render(<Host />);

    expect(load).not.toHaveBeenCalled();
  });

  it('preloadEditorUI loads every registered part', async () => {
    const load = vi.fn(() => Promise.resolve('x'));
    const module = lazyModule(load);

    await preloadEditorUI();

    expect(load).toHaveBeenCalledTimes(1);
    expect(module.get()).toBe('x');
  });
});
