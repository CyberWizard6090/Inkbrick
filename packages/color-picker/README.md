# @inkbrick/color-picker

A colour picker with an alpha channel from [Inkbrick](https://github.com/CyberWizard6090/Inkbrick), in plain DOM: no
framework inside, so it works the same in React, Vue, Svelte, Angular or a page without a framework. The editor uses it for
«Custom color…» (text colour, highlight, block and table cell backgrounds), but it does not depend on the editor.

```bash
npm install @inkbrick/color-picker @inkbrick/styles
```

```ts
import '@inkbrick/styles/tokens.css';
import '@inkbrick/styles/color-picker.css';
```

## What is inside

- a saturation and brightness area, a hue slider and an opacity slider (over a checkerboard), a preview swatch;
- fields in the chosen format — **HEX**, **RGB** or **HSB** — and an opacity field in percent;
- optional **Cancel** and **Apply** buttons.

Everything works with a mouse, a finger and the keyboard: the area and the sliders are `role="slider"`, arrows move them
by one step (Shift — by ten), Home and End jump to the ends. Enter in a field applies, Escape cancels. The arrow keys do
not leak into a menu around the picker.

## Usage

`createColorPicker` returns an element: put it wherever you like (a popover, a menu, a panel).

```ts
import { createColorPicker } from '@inkbrick/color-picker';

const picker = createColorPicker({
  value: '#1473e680', // #rgb, #rrggbb, #rrggbbaa or rgb()/rgba()
  actions: true, // Cancel and Apply buttons
  onChange: (hex) => preview(hex), // every move
  onApply: (hex) => save(hex), // Apply or Enter in a field
  onCancel: () => close(), // Cancel or Escape
});

popover.append(picker.element);

picker.getValue(); // '#1473e680'
picker.setValue('#ff0000'); // without onChange
picker.destroy(); // removes the listeners and the element
```

The result is `#rrggbb` while the colour is opaque and `#rrggbbaa` below 100 % opacity; `alphaHex: 'always'` always gives
eight digits, `alpha: false` hides the opacity slider and field. `format: 'rgb' | 'hsb'` picks the fields shown at first.

| Option     | Meaning                                                                  |
| ---------- | ------------------------------------------------------------------------ |
| `value`    | Starting colour; an unknown string starts from black                     |
| `alpha`    | Show the opacity slider and field (default `true`)                       |
| `alphaHex` | `'auto'` (default) — eight digits only below 100 %, `'always'` — always  |
| `format`   | Fields shown at first: `'hex'` (default), `'rgb'`, `'hsb'`               |
| `actions`  | Show Cancel and Apply                                                    |
| `labels`   | Texts for screen readers and the buttons (`DEFAULT_COLOR_PICKER_LABELS`) |
| `theme`    | `'light'` or `'dark'` when the picker sits outside a themed element      |

## Colour helpers

```ts
import { parseColor, formatHex, rgbToHsv, hsvToRgb } from '@inkbrick/color-picker';

parseColor('#1473e680'); // { r: 20, g: 115, b: 230, a: 0.5 }
formatHex({ r: 20, g: 115, b: 230, a: 0.5 }); // '#1473e680'
```

## Styling

Styles live in `@inkbrick/styles/color-picker.css`, in the `inkbrick.ui` layer with zero specificity: any rule of yours
wins. Colours, fonts and corners come from the Inkbrick tokens, so the picker follows the light and dark themes. The parts
are `data-inkbrick-part` attributes inside `[data-inkbrick-ui="color-picker"]` (see `docs/styling.md`).
