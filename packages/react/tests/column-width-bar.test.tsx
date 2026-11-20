import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import { ColumnWidthBar } from '../src/table/ColumnWidthBar';

afterEach(cleanup);

function mount(over: Partial<Parameters<typeof ColumnWidthBar>[0]> = {}) {
  const calls = {
    onInput: vi.fn(),
    onCommit: vi.fn(),
    onAuto: vi.fn(),
    onClose: vi.fn(),
  };
  const view = render(
    <ColumnWidthBar column={2} min={40} max={300} value={120} auto={false} {...calls} {...over} />,
  );

  return { ...view, ...calls };
}

describe('the column width bar (phone)', () => {
  it('shows the column and its width, and the slider spans the allowed range', () => {
    const { container } = mount();
    const slider = container.querySelector<HTMLInputElement>('input[type="range"]')!;

    expect(container.textContent).toContain('120 px');
    expect(slider.min).toBe('40');
    expect(slider.max).toBe('300');
    expect(slider.value).toBe('120');
  });

  it('moving the slider previews the width; releasing the finger commits it', () => {
    const { container, onInput, onCommit } = mount();
    const slider = container.querySelector<HTMLInputElement>('input[type="range"]')!;

    fireEvent.input(slider, { target: { value: '180' } });
    expect(onInput).toHaveBeenCalledWith(180);
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.pointerUp(slider);
    expect(onCommit).toHaveBeenCalledWith(180);
  });

  it('a gesture taken over by the browser (pointercancel) still commits the shown width', () => {
    const { container, onCommit } = mount();
    const slider = container.querySelector<HTMLInputElement>('input[type="range"]')!;

    fireEvent.input(slider, { target: { value: '150' } });
    fireEvent.pointerCancel(slider);
    expect(onCommit).toHaveBeenCalledWith(150);
  });

  it('the − and + buttons nudge by one pixel and stop at the limits', () => {
    const { container, onCommit, rerender } = mount();
    const button = (action: string) =>
      container.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;

    fireEvent.click(button('column-width-wider'));
    expect(onCommit).toHaveBeenLastCalledWith(121);
    fireEvent.click(button('column-width-narrower'));
    expect(onCommit).toHaveBeenLastCalledWith(119);

    rerender(
      <ColumnWidthBar
        column={2}
        min={40}
        max={300}
        value={300}
        auto={false}
        onInput={vi.fn()}
        onCommit={onCommit}
        onAuto={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(button('column-width-wider').disabled).toBe(true);
  });

  it('"fit content" is off for a column that already fits, and Done and Escape close the bar', () => {
    const fitted = mount({ auto: true });

    expect(
      fitted.container.querySelector<HTMLButtonElement>('[data-action="column-width-auto"]')!
        .disabled,
    ).toBe(true);
    fireEvent.click(fitted.container.querySelector('[data-action="column-width-done"]')!);
    expect(fitted.onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(fitted.onClose).toHaveBeenCalledTimes(2);
  });

  it('fit content calls back for a column with its own width', () => {
    const { container, onAuto } = mount();

    fireEvent.click(container.querySelector('[data-action="column-width-auto"]')!);
    expect(onAuto).toHaveBeenCalledTimes(1);
  });
});
