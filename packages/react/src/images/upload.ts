import { isSafeImageUrl } from '@inkbrick/document';

import { ImageError } from './ImageError';
import {
  DEFAULT_IMAGE_TYPES,
  DEFAULT_MAX_INLINE_BYTES,
  MAX_INLINE_BYTES_LIMIT,
  type ImageOptions,
} from './types';

export function isAcceptedImage(file: { type: string }, options: ImageOptions): boolean {
  return (options.acceptedTypes ?? DEFAULT_IMAGE_TYPES).includes(file.type.toLowerCase());
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ImageError('read', 'Could not read the file'));
    reader.readAsDataURL(file);
  });
}

export async function uploadImage(file: File, options: ImageOptions): Promise<string> {
  if (!isAcceptedImage(file, options)) {
    const type = file.type || 'unknown';

    throw new ImageError('type', `Unsupported image type "${type}"`, { type });
  }

  let url: string;

  if (options.upload) {
    url = await options.upload(file);
  } else {
    const limit = Math.min(
      options.maxInlineBytes ?? DEFAULT_MAX_INLINE_BYTES,
      MAX_INLINE_BYTES_LIMIT,
    );

    if (file.size > limit) {
      const size = Math.round(limit / 1024);

      throw new ImageError(
        'size',
        `The image is larger than ${size} KB. Provide "images.upload" to store larger images.`,
        { size },
      );
    }

    url = await readAsDataUrl(file);
  }

  if (!isSafeImageUrl(url))
    throw new ImageError('uploadAddress', 'The upload returned an unsupported image address');

  return url;
}

export function normalizeImageUrl(input: string): string | null {
  const value = input.trim();

  if (value === '') return null;

  const candidate =
    /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('/') ? value : `https://${value}`;

  return isSafeImageUrl(candidate) ? candidate : null;
}
