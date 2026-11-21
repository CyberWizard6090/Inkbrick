# @inkbrick/image-tools

Image cropping and a full-screen image viewer for React, from [Inkbrick](https://github.com/CyberWizard6090/Inkbrick).
The editor uses it for its image block, but it does not depend on the editor: any React application can use it.

```bash
npm install @inkbrick/image-tools @inkbrick/styles
```

```ts
import '@inkbrick/styles/tokens.css';
import '@inkbrick/styles/image-tools.css';
```

## Crop dialog

A full-screen window: the picture with a frame that is moved and resized by its edges and corners; a shape menu
(freeform, circle, square, 5:4, 4:3, 7:5, 3:2, 5:3, 16:9 — each in portrait or landscape), **Cancel** and **Save**.
Keyboard: arrows move the frame (Ctrl — bigger steps), Shift with arrows resizes it, Enter saves, Escape cancels.

```tsx
import { ImageCropper, cropImage, type CropResult } from '@inkbrick/image-tools';

function Crop({ src, onDone }: { src: string; onDone(file: Blob): void }) {
  const [open, setOpen] = useState(true);

  const save = async ({ rect, aspect }: CropResult) => {
    // The frame is in fractions of the picture; the file is made on a canvas (a circle is a WebP with clear corners, PNG where the browser cannot write WebP).
    onDone(await cropImage(src, rect, { shape: aspect === 'circle' ? 'circle' : 'rect' }));
    setOpen(false);
  };

  return open ? <ImageCropper src={src} onSave={save} onCancel={() => setOpen(false)} /> : null;
}
```

`ImageCropper` does not change anything itself: it returns the frame (`rect`, fractions 0…1 of the picture), the shape
and the size of the picture. `cropImage` fails when the picture cannot be read (a server without CORS); keep the frame
and crop with CSS then. Labels are English by default; pass `labels` to translate them.

## Viewer

```tsx
import { ImageViewer } from '@inkbrick/image-tools';

<ImageViewer
  images={[{ src: a }, { src: b, alt: 'Second' }]}
  index={index}
  onIndexChange={setIndex}
  onClose={close}
/>;
```

Previous and next, zoom (buttons, wheel, pinch, double click), panning the zoomed picture, download (`onDownload` or the
built-in one) and close. Keys: arrows, `+`, `-`, `0`, Escape.

## Helpers

Geometry of the frame (`resizeRect`, `moveRect`, `fitRatio`, `relativeRatio`, `oriented`, …), the canvas (`cropImage`,
`loadImage`, `blobToDataUrl`) and downloads (`downloadImage`, `downloadBlob`, `fileNameFor`).

## License

MIT. Icons: Lucide (ISC), see `THIRD_PARTY_NOTICES.md`.
