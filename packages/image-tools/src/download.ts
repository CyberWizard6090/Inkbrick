import { mimeOf } from './canvas';

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

/**
 * Имя файла для сохранения: последняя часть адреса (если похожа на имя файла) или `fallback` с расширением по типу
 * картинки.
 */
export function fileNameFor(src: string, fallback = 'image', type?: string | null): string {
  if (!/^(data|blob):/i.test(src)) {
    const last = decodeURIComponent(src.split(/[?#]/)[0].split('/').pop() ?? '');

    if (/^[^\\/:*?"<>|]+\.[a-z0-9]{2,5}$/i.test(last)) return last;
  }

  const extension = EXTENSIONS[type ?? mimeOf(src) ?? ''] ?? 'png';

  return `${fallback}.${extension}`;
}

function click(href: string, name: string, newTab = false) {
  const link = document.createElement('a');

  link.href = href;
  link.download = name;

  if (newTab) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }

  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
}

/** Сохраняет файл под именем `name`. */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);

  click(url, name);
  // Ссылку освобождаем не сразу: браузеру нужно время начать загрузку.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Сохраняет картинку по адресу. Атрибут `download` у ссылки на чужой сервер браузеры не учитывают, поэтому картинка
 * сначала скачивается в память; если сервер не разрешает (нет CORS), она открывается в новой вкладке.
 */
export async function downloadImage(src: string, name = fileNameFor(src)): Promise<void> {
  try {
    const response = await fetch(src, { referrerPolicy: 'no-referrer' });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    downloadBlob(await response.blob(), name);
  } catch {
    click(src, name, true);
  }
}
