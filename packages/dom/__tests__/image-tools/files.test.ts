import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  blobToDataUrl,
  cropImage,
  downloadBlob,
  downloadImage,
  fileNameFor,
  loadImage,
  mimeOf,
  outputType,
} from '../../src/image-tools';

describe('types and names', () => {
  it('reads the type from a data: address or the extension', () => {
    expect(mimeOf('data:image/webp;base64,AAA')).toBe('image/webp');
    expect(mimeOf('https://a.test/b/c.JPG?x=1#y')).toBe('image/jpeg');
    expect(mimeOf('https://a.test/b/c')).toBeNull();
    expect(mimeOf('https://a.test/b/c.tiff')).toBeNull();
  });

  it('the crop keeps a format the canvas writes; a circle is WebP (transparent, small)', () => {
    expect(outputType('a.jpg')).toBe('image/jpeg');
    expect(outputType('a.gif')).toBe('image/png');
    expect(outputType('a.jpg', { shape: 'circle' })).toBe('image/webp');
    expect(outputType('a.png', { type: 'image/webp' })).toBe('image/webp');
  });

  it('a file name comes from the address or from the type', () => {
    expect(fileNameFor('https://a.test/photos/cat%20one.png?w=1')).toBe('cat one.png');
    expect(fileNameFor('https://a.test/render')).toBe('image.png');
    expect(fileNameFor('data:image/jpeg;base64,AAA', 'crop')).toBe('crop.jpg');
    expect(fileNameFor('https://a.test/x.png', 'crop', 'image/webp')).toBe('x.png');
    expect(fileNameFor('blob:https://a.test/123', 'image', 'image/webp')).toBe('image.webp');
  });
});

describe('canvas', () => {
  afterEach(() => vi.restoreAllMocks());

  /** Картинка, которая «загрузилась», с заданным размером. */
  function picture(width: number, height: number, src = 'https://a.test/p.jpg') {
    const image = new Image();

    Object.defineProperty(image, 'naturalWidth', { value: width });
    Object.defineProperty(image, 'naturalHeight', { value: height });
    image.src = src;

    return image;
  }

  function fakeCanvas(toBlob: HTMLCanvasElement['toBlob']) {
    const context = {
      beginPath: vi.fn(),
      ellipse: vi.fn(),
      clip: vi.fn(),
      drawImage: vi.fn(),
    };
    const canvas = { width: 0, height: 0, getContext: () => context, toBlob };
    const create = document.createElement.bind(document);

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) =>
      tag === 'canvas' ? (canvas as unknown as HTMLCanvasElement) : create(tag),
    );

    return { canvas, context };
  }

  it('draws the frame of the picture at its own pixel size; a circle is clipped', async () => {
    const { canvas, context } = fakeCanvas((done, type) => done(new Blob(['x'], { type })));
    const blob = await cropImage(picture(400, 200), { x: 0.5, y: 0, width: 0.5, height: 1 });

    expect(blob.type).toBe('image/jpeg');
    expect([canvas.width, canvas.height]).toEqual([200, 200]);
    expect(context.drawImage).toHaveBeenCalledWith(
      expect.anything(),
      200,
      0,
      200,
      200,
      0,
      0,
      200,
      200,
    );
    expect(context.clip).not.toHaveBeenCalled();

    const round = await cropImage(
      picture(400, 200),
      { x: 0, y: 0, width: 0.5, height: 1 },
      {
        shape: 'circle',
      },
    );

    expect(round.type).toBe('image/webp');
    expect(context.ellipse).toHaveBeenCalledWith(100, 100, 100, 100, 0, 0, Math.PI * 2);
    expect(context.clip).toHaveBeenCalled();
  });

  it('fails on a tainted canvas, an empty picture and a failed encoding', async () => {
    fakeCanvas(() => {
      throw new DOMException('Tainted', 'SecurityError');
    });
    await expect(cropImage(picture(10, 10), { x: 0, y: 0, width: 1, height: 1 })).rejects.toThrow(
      'Tainted',
    );
    await expect(cropImage(picture(0, 0), { x: 0, y: 0, width: 1, height: 1 })).rejects.toThrow(
      'no size',
    );

    vi.restoreAllMocks();
    fakeCanvas((done) => done(null));
    await expect(cropImage(picture(10, 10), { x: 0, y: 0, width: 1, height: 1 })).rejects.toThrow(
      'encode',
    );
  });

  it('loads a picture: other servers anonymously (CORS), data: as is', async () => {
    // jsdom картинки не грузит: события загрузки подаём сами.
    const original = window.Image;
    const made: HTMLImageElement[] = [];

    window.Image = class extends original {
      constructor() {
        super();
        made.push(this);
      }
    } as typeof Image;

    try {
      const remote = loadImage('https://a.test/q.png');
      const local = loadImage('data:image/png;base64,AAA');

      expect(made[0].crossOrigin).toBe('anonymous');
      expect(made[1].crossOrigin).toBeNull();
      made[0].onload!(new Event('load'));
      await expect(remote).resolves.toBe(made[0]);
      made[1].onerror!(new Event('error'));
      await expect(local).rejects.toThrow('Could not load');
    } finally {
      window.Image = original;
    }
  });

  it('reads a file as a data: address', async () => {
    expect(await blobToDataUrl(new Blob(['hi'], { type: 'text/plain' }))).toBe(
      'data:text/plain;base64,aGk=',
    );
  });
});

describe('downloads', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function clicks() {
    const links: HTMLAnchorElement[] = [];

    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      links.push(this);
    });

    return links;
  }

  it('a file is saved through an object URL under its name', () => {
    const links = clicks();

    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    downloadBlob(new Blob(['x']), 'a.png');

    expect(links[0].href).toBe('blob:x');
    expect(links[0].download).toBe('a.png');
    expect(links[0].isConnected).toBe(false);
  });

  it('a picture is fetched first; without CORS it opens in a new tab', async () => {
    const links = clicks();

    URL.createObjectURL = vi.fn(() => 'blob:y');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob(['x']) })),
    );
    await downloadImage('https://a.test/p.png');
    expect(links[0]).toMatchObject({ href: 'blob:y', download: 'p.png' });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('CORS'))),
    );
    await downloadImage('https://a.test/q.png', 'q.png');
    expect(links[1]).toMatchObject({ href: 'https://a.test/q.png', target: '_blank' });
    expect(links[1].rel).toBe('noopener noreferrer');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, blob: async () => new Blob([]) })),
    );
    await downloadImage('https://a.test/r.png');
    expect(links[2].target).toBe('_blank');
  });
});
