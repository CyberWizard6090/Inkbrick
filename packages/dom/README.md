# @inkbrick/dom

Parts of the [Inkbrick](https://github.com/CyberWizard6090/Inkbrick) interface in plain DOM: no framework inside, so they
work the same in React, Vue, Svelte, Angular or a page without a framework — and without the editor itself. The editor
uses them, but they do not depend on it.

```bash
npm install @inkbrick/dom @inkbrick/styles
```

Each part has its own entry, so a bundle gets only what it imports:

| Entry                          | What                                                                          | Styles                              |
| ------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------- |
| `@inkbrick/dom/color-picker`   | Colour picker with an alpha channel                                           | `@inkbrick/styles/color-picker.css` |
| `@inkbrick/dom/image-tools`    | Image crop window, full-screen image viewer, crop and download helpers        | `@inkbrick/styles/image-tools.css`  |
| `@inkbrick/dom/code-highlight` | Code syntax highlighting into token ranges (no DOM needed, works on a server) | `--inkbrick-syntax-*` tokens        |
| `@inkbrick/dom/keys`           | Matching a keyboard event against a shortcut like `Mod-Shift-z`               | —                                   |

`@inkbrick/dom` itself re-exports all of them. The styles need the tokens:

```ts
import '@inkbrick/styles/tokens.css';
import '@inkbrick/styles/color-picker.css';
import '@inkbrick/styles/image-tools.css';
```

## Colour picker — `@inkbrick/dom/color-picker`

### What is inside

- a saturation and brightness area, a hue slider and an opacity slider (over a checkerboard), a preview swatch;
- fields in the chosen format — **HEX**, **RGB** or **HSB** — and an opacity field in percent;
- optional **Cancel** and **Apply** buttons.

Everything works with a mouse, a finger and the keyboard: the area and the sliders are `role="slider"`, arrows move them
by one step (Shift — by ten), Home and End jump to the ends. Enter in a field applies, Escape cancels. The arrow keys do
not leak into a menu around the picker.

### Usage

`createColorPicker` returns an element: put it wherever you like (a popover, a menu, a panel).

```ts
import { createColorPicker } from '@inkbrick/dom/color-picker';

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

### Colour helpers

```ts
import { parseColor, formatHex, rgbToHsv, hsvToRgb } from '@inkbrick/dom/color-picker';

parseColor('#1473e680'); // { r: 20, g: 115, b: 230, a: 0.5 }
formatHex({ r: 20, g: 115, b: 230, a: 0.5 }); // '#1473e680'
```

### Styling

Styles live in `@inkbrick/styles/color-picker.css`, in the `inkbrick.ui` layer with zero specificity: any rule of yours
wins. Colours, fonts and corners come from the Inkbrick tokens, so the picker follows the light and dark themes. The parts
are `data-inkbrick-part` attributes inside `[data-inkbrick-ui="color-picker"]` (see `docs/styling.md`).

## Image tools — `@inkbrick/dom/image-tools`

### Crop window

A full-screen window: the picture with a frame that is moved and resized by its edges and corners; a shape menu
(freeform, circle, square, 5:4, 4:3, 7:5, 3:2, 5:3, 16:9 — each in portrait or landscape), **Cancel** and **Save**.
Keyboard: arrows move the frame (Ctrl — bigger steps), Shift with arrows resizes it, Enter saves, Escape cancels.

The simplest way is a promise: the result, or `null` when the user cancelled.

```ts
import { cropDialog, cropImage } from '@inkbrick/dom/image-tools';

const result = await cropDialog({ src });

if (result) {
  // The frame is in fractions of the picture; the file is made on a canvas
  // (a circle is a WebP with clear corners, PNG where the browser cannot write WebP).
  const file = await cropImage(src, result.rect, {
    shape: result.aspect === 'circle' ? 'circle' : 'rect',
  });
}
```

`openCropper` gives full control: callbacks, a busy state while you save, and `close()` when you are done.

```ts
const cropper = openCropper({
  src,
  labels: { title: 'Обрезать', cancel: 'Отмена', save: 'Сохранить' },
  async onSave(result) {
    cropper.setBusy(true);
    await upload(await cropImage(src, result.rect));
    cropper.close();
  },
  onCancel: () => cropper.close(),
});
```

In Vue, for example, open it from a handler (or `onMounted`) and close it in `onUnmounted`; in React — in `useEffect`
with `close` as the cleanup.

### Viewer

```ts
import { openViewer } from '@inkbrick/dom/image-tools';

const viewer = openViewer({
  images: [{ src: a }, { src: b, alt: 'Second' }],
  index: 0,
  onClose: () => {},
});

viewer.show(1); // another picture
viewer.close(); // remove it without onClose
```

Previous and next, zoom (buttons, wheel, pinch, double click), panning the zoomed picture, download (`onDownload` or the
built-in one) and close (button, Escape, a click beside the picture — the window then closes itself and calls
`onClose`). Keys: arrows, `+`, `-`, `0`, Escape.

Both windows are modal: the focus goes in and comes back on close, Tab stays inside, the page does not scroll under
them. `container` puts a window into another element (default `document.body`), `theme` sets `data-inkbrick-theme`.
Labels are English by default; pass `labels` to translate them.

### Helpers

Geometry of the frame (`resizeRect`, `moveRect`, `fitRatio`, `relativeRatio`, `oriented`, …), the canvas (`cropImage`,
`loadImage`, `blobToDataUrl`) and downloads (`downloadImage`, `downloadBlob`, `fileNameFor`).

## Code highlighting — `@inkbrick/dom/code-highlight`

```ts
import { highlightCode, normalizeLanguage } from '@inkbrick/dom/code-highlight';

const tokens = highlightCode('const a = 1;', normalizeLanguage('ts'));
// [{ from: 0, to: 5, type: 'keyword' }, { from: 10, to: 11, type: 'number' }, …]
```

Tokens are plain ranges: wrap them in any framework or into HTML on a server. Text longer than `HIGHLIGHT_LIMIT` is not
highlighted.

## Shortcuts — `@inkbrick/dom/keys`

```ts
import { matchesShortcut } from '@inkbrick/dom/keys';

element.addEventListener('keydown', (event) => {
  if (matchesShortcut(event, 'Mod-Shift-z')) redo();
});
```

`Mod` is `Cmd` on macOS and `Ctrl` elsewhere; modifiers are `Mod`, `Ctrl`, `Meta`/`Cmd`, `Alt`/`Option`, `Shift`.

### License

MIT. Icons: Lucide (ISC), see `THIRD_PARTY_NOTICES.md`.
