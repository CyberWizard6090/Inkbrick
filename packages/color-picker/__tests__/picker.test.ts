import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/dom';

import {
  createColorPicker,
  formatHex,
  hsvToRgb,
  parseColor,
  rgbToHsv,
  type ColorPickerHandle,
  type ColorPickerOptions,
} from '../src';

describe('colour math', () => {
  it('parses short and long hex, with and without alpha, and rgb()', () => {
    expect(parseColor('#f80')).toEqual({ r: 255, g: 136, b: 0, a: 1 });
    expect(parseColor('f808')).toEqual({ r: 255, g: 136, b: 0, a: 136 / 255 });
    expect(parseColor('#1473E6')).toEqual({ r: 20, g: 115, b: 230, a: 1 });
    expect(parseColor('#1473e680')).toEqual({ r: 20, g: 115, b: 230, a: 128 / 255 });
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseColor('rgb(10 20 30 / 25%)')).toEqual({ r: 10, g: 20, b: 30, a: 0.25 });
    expect(parseColor('red')).toBeNull();
    expect(parseColor('#12345')).toBeNull();
  });

  it('writes eight digits only below full opacity (or always / never on request)', () => {
    expect(formatHex({ r: 20, g: 115, b: 230, a: 1 })).toBe('#1473e6');
    expect(formatHex({ r: 20, g: 115, b: 230, a: 0.5 })).toBe('#1473e680');
    expect(formatHex({ r: 20, g: 115, b: 230, a: 1 }, 'always')).toBe('#1473e6ff');
    expect(formatHex({ r: 20, g: 115, b: 230, a: 0.5 }, 'never')).toBe('#1473e6');
  });

  it('HSB and RGB convert both ways', () => {
    for (const hex of [
      '#000000',
      '#ffffff',
      '#ff0000',
      '#00ff00',
      '#0000ff',
      '#1473e6',
      '#d49b00',
      '#8b3fe0',
    ]) {
      const rgb = parseColor(hex)!;

      expect(formatHex(hsvToRgb(rgbToHsv(rgb)))).toBe(hex);
    }

    expect(rgbToHsv({ r: 255, g: 0, b: 0, a: 1 })).toEqual({ h: 0, s: 1, v: 1, a: 1 });
    expect(hsvToRgb({ h: 120, s: 1, v: 0.5, a: 0.3 })).toEqual({ r: 0, g: 128, b: 0, a: 0.3 });
  });
});

describe('createColorPicker', () => {
  const opened: ColorPickerHandle[] = [];

  afterEach(() => {
    for (const handle of opened.splice(0)) handle.destroy();
    vi.restoreAllMocks();
  });

  function picker(options: ColorPickerOptions = {}) {
    const handle = createColorPicker(options);

    document.body.append(handle.element);
    opened.push(handle);

    const part = <T extends HTMLElement = HTMLElement>(name: string) =>
      handle.element.querySelector<T>(`[data-inkbrick-part="${name}"]`)!;

    return { handle, part };
  }

  /** jsdom не меряет элементы: полосы и квадрат — 100 × 100 в углу окна. */
  function sizeAll() {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }) as DOMRect,
    );
  }

  it('starts from the given colour and shows it in the fields and the sliders', () => {
    const { handle, part } = picker({ value: '#1473e680' });

    expect(handle.getValue()).toBe('#1473e680');
    expect(part<HTMLInputElement>('color-field').value).toBe('1473E6');
    expect(part<HTMLInputElement>('color-opacity').value).toBe('50%');
    expect(part('color-alpha').getAttribute('aria-valuenow')).toBe('50');
    expect(part('color-hue').getAttribute('aria-valuenow')).toBe('213');
    expect(handle.element.getAttribute('role')).toBe('group');
  });

  it('dragging the area, the hue and the opacity changes the colour', () => {
    sizeAll();

    const onChange = vi.fn();
    const { handle, part } = picker({ value: '#ff0000', onChange });

    // Левый нижний угол квадрата — чёрный.
    fireEvent.pointerDown(part('color-area'), { clientX: 0, clientY: 100, button: 0 });
    expect(handle.getValue()).toBe('#000000');

    // Правый верхний — чистый цвет оттенка; оттенок на трети полосы — зелёный.
    fireEvent.pointerDown(part('color-area'), { clientX: 100, clientY: 0, button: 0 });
    fireEvent.pointerDown(part('color-hue'), { clientX: 100 / 3, clientY: 5, button: 0 });
    expect(handle.getValue()).toBe('#00ff00');

    fireEvent.pointerDown(part('color-alpha'), { clientX: 25, clientY: 5, button: 0 });
    expect(handle.getValue()).toBe('#00ff0040');
    expect(onChange).toHaveBeenLastCalledWith('#00ff0040');
  });

  it('arrow keys move the sliders (Shift — by ten), Home and End jump, and the menu around does not get them', () => {
    const { handle, part } = picker({ value: '#ff000080' });
    const outside = vi.fn();

    document.body.addEventListener('keydown', outside);

    fireEvent.keyDown(part('color-alpha'), { key: 'ArrowRight', shiftKey: true });
    expect(part('color-alpha').getAttribute('aria-valuenow')).toBe('60');
    fireEvent.keyDown(part('color-alpha'), { key: 'End' });
    expect(handle.getValue()).toBe('#ff0000');

    fireEvent.keyDown(part('color-hue'), { key: 'ArrowRight' });
    expect(part('color-hue').getAttribute('aria-valuenow')).toBe('1');

    fireEvent.keyDown(part('color-area'), { key: 'ArrowDown', shiftKey: true });
    expect(part('color-area').getAttribute('aria-valuetext')).toContain('Brightness 90%');
    expect(outside).not.toHaveBeenCalled();

    document.body.removeEventListener('keydown', outside);
  });

  it('the HEX, RGB and HSB fields and the opacity field set the colour; a wrong value goes back', () => {
    const { handle, part } = picker({ value: '#000000' });
    const field = () =>
      handle.element.querySelectorAll<HTMLInputElement>('[data-inkbrick-part="color-field"]');

    field()[0].value = '1473e6';
    fireEvent.change(field()[0]);
    expect(handle.getValue()).toBe('#1473e6');

    // Восемь цифр несут и прозрачность.
    field()[0].value = '#1473e633';
    fireEvent.change(field()[0]);
    expect(handle.getValue()).toBe('#1473e633');

    part<HTMLInputElement>('color-opacity').value = '100';
    fireEvent.change(part('color-opacity'));
    expect(handle.getValue()).toBe('#1473e6');

    field()[0].value = 'nonsense';
    fireEvent.change(field()[0]);
    expect(field()[0].value).toBe('1473E6');

    const select = part<HTMLSelectElement>('color-format');

    select.value = 'rgb';
    fireEvent.change(select);
    expect([...field()].map((input) => input.value)).toEqual(['20', '115', '230']);
    field()[1].value = '0';
    fireEvent.change(field()[1]);
    expect(handle.getValue()).toBe('#1400e6');

    select.value = 'hsb';
    fireEvent.change(select);
    expect(field()).toHaveLength(3);
    field()[0].value = '0';
    field()[1].value = '100';
    field()[2].value = '100';
    fireEvent.change(field()[2]);
    expect(handle.getValue()).toBe('#ff0000');
    expect(field()[0].getAttribute('aria-label')).toBe('Hue');
  });

  it('Apply, Enter in a field, Cancel and Escape; labels can be translated', () => {
    const onApply = vi.fn();
    const onCancel = vi.fn();
    const { part } = picker({
      value: '#1473e6',
      actions: true,
      onApply,
      onCancel,
      labels: { apply: 'Применить' },
    });

    expect(part('color-apply').textContent).toBe('Применить');
    fireEvent.click(part('color-apply'));
    expect(onApply).toHaveBeenLastCalledWith('#1473e6');

    const field = part<HTMLInputElement>('color-field');

    field.value = 'ff0000';
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onApply).toHaveBeenLastCalledWith('#ff0000');

    fireEvent.click(part('color-cancel'));
    fireEvent.keyDown(part('color-area'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('without alpha there is no opacity slider and the colour is always opaque; alphaHex always gives eight digits', () => {
    const { handle, part } = picker({ value: '#1473e680', alpha: false });

    expect(part('color-alpha')).toBeNull();
    expect(part('color-opacity')).toBeNull();
    expect(handle.getValue()).toBe('#1473e6');

    const always = picker({ value: '#1473e6', alphaHex: 'always' });

    expect(always.handle.getValue()).toBe('#1473e6ff');
  });

  it('a grey keeps the hue of the slider; setValue does not report a change; destroy removes the element', () => {
    const onChange = vi.fn();
    const { handle, part } = picker({ value: '#00ff00', onChange });

    handle.setValue('#808080');
    expect(part('color-hue').getAttribute('aria-valuenow')).toBe('120');
    expect(onChange).not.toHaveBeenCalled();

    handle.setValue('not a colour');
    expect(handle.getValue()).toBe('#808080');

    handle.destroy();
    expect(handle.element.isConnected).toBe(false);
  });
});
