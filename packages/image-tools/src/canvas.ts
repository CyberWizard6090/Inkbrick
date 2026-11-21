import { pixelSize, type CropRect } from './geometry';

/**
 * Загрузка картинки для холста. Чужие адреса грузятся с `crossOrigin="anonymous"`: если сервер отдаёт CORS, из
 * картинки можно сделать файл; если нет — загрузка падает, и вызывающий решает, что делать (обрезать стилем).
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    if (!/^(data|blob):/i.test(src)) image.crossOrigin = 'anonymous';

    image.referrerPolicy = 'no-referrer';
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load the image: ${src.slice(0, 80)}`));
    image.src = src;
  });
}

/** Форматы, которые холст умеет записывать во всех браузерах. */
const WRITABLE = new Set(['image/png', 'image/jpeg', 'image/webp']);

/** MIME-тип картинки по data:-адресу или расширению; неизвестный — `null`. */
export function mimeOf(src: string): string | null {
  const data = /^data:([^;,]+)/i.exec(src);

  if (data) return data[1].toLowerCase();

  const path = src.split(/[?#]/)[0].toLowerCase();
  const extension = /\.([a-z0-9]+)$/.exec(path)?.[1];
  const types: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    avif: 'image/avif',
  };

  return extension ? (types[extension] ?? null) : null;
}

export interface CropImageOptions {
  /** `circle` — всё вне вписанного эллипса прозрачно (файл всегда PNG). */
  readonly shape?: 'rect' | 'circle';
  /** Формат результата; по умолчанию — формат исходной картинки, если холст его пишет, иначе PNG. */
  readonly type?: string;
  /** Качество JPEG и WebP (0…1), по умолчанию 0,92. */
  readonly quality?: number;
}

/** Формат файла обрезки: круг — всегда PNG (нужна прозрачность), иначе исходный формат, если холст его пишет. */
export function outputType(src: string, options: CropImageOptions = {}): string {
  if (options.shape === 'circle') return 'image/png';

  const wanted = options.type ?? mimeOf(src) ?? 'image/png';

  return WRITABLE.has(wanted) ? wanted : 'image/png';
}

/**
 * Вырезает рамку из картинки и возвращает файл. Падает, если картинку нельзя прочитать (чужой сервер без CORS: холст
 * «испорчен») или браузер не умеет холст.
 */
export async function cropImage(
  source: string | HTMLImageElement,
  rect: CropRect,
  options: CropImageOptions = {},
): Promise<Blob> {
  const image = typeof source === 'string' ? await loadImage(source) : source;
  const natural = { width: image.naturalWidth, height: image.naturalHeight };

  if (natural.width === 0 || natural.height === 0) throw new Error('The image has no size');

  const size = pixelSize(rect, natural);
  const canvas = document.createElement('canvas');

  canvas.width = size.width;
  canvas.height = size.height;

  const context = canvas.getContext('2d');

  if (!context) throw new Error('Canvas 2D is not available');

  if (options.shape === 'circle') {
    context.beginPath();
    context.ellipse(
      size.width / 2,
      size.height / 2,
      size.width / 2,
      size.height / 2,
      0,
      0,
      Math.PI * 2,
    );
    context.clip();
  }

  context.drawImage(
    image,
    rect.x * natural.width,
    rect.y * natural.height,
    rect.width * natural.width,
    rect.height * natural.height,
    0,
    0,
    size.width,
    size.height,
  );

  const type = outputType(typeof source === 'string' ? source : image.src, options);

  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image'))),
        type,
        options.quality ?? 0.92,
      );
    } catch (error) {
      // «Испорченный» холст (картинка с чужого сервера без CORS) бросает SecurityError сразу.
      reject(error);
    }
  });
}

/** Файл как data:-адрес. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsDataURL(blob);
  });
}
