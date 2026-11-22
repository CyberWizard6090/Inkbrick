# @inkbrick/image-tools

Image cropping and a full-screen image viewer from [Inkbrick](https://github.com/CyberWizard6090/Inkbrick), in plain
DOM: no framework inside, so it works the same in React, Vue, Svelte, Angular or a page without a framework. The editor
uses it for its image block, but it does not depend on the editor.

```bash
npm install @inkbrick/image-tools @inkbrick/styles
```

```ts
import '@inkbrick/styles/tokens.css';
import '@inkbrick/styles/image-tools.css';
```

## Crop window

A full-screen window: the picture with a frame that is moved and resized by its edges and corners; a shape menu
(freeform, circle, square, 5:4, 4:3, 7:5, 3:2, 5:3, 16:9 — each in portrait or landscape), **Cancel** and **Save**.
Keyboard: arrows move the frame (Ctrl — bigger steps), Shift with arrows resizes it, Enter saves, Escape cancels.

The simplest way is a promise: the result, or `null` when the user cancelled.

```ts
import { cropDialog, cropImage } from '@inkbrick/image-tools';

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

## Viewer

```ts
import { openViewer } from '@inkbrick/image-tools';

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

## Helpers

Geometry of the frame (`resizeRect`, `moveRect`, `fitRatio`, `relativeRatio`, `oriented`, …), the canvas (`cropImage`,
`loadImage`, `blobToDataUrl`) and downloads (`downloadImage`, `downloadBlob`, `fileNameFor`).

## License

MIT. Icons: Lucide (ISC), see `THIRD_PARTY_NOTICES.md`.
