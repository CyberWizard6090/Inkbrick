import type { ImageErrorInfo } from './ImageError';

/**
 * Какие блоки-картинки сейчас загружаются и какие ошибки загрузки показать. Состояние живёт здесь, а не в
 * компоненте: пока файл обрабатывается, выбор файла заменяется индикатором и локальное состояние пропало бы.
 */
export class UploadTracker {
  private readonly active = new Set<string>();

  private readonly errors = new Map<string, ImageErrorInfo>();

  private readonly listeners = new Set<() => void>();

  has = (blockId: string): boolean => this.active.has(blockId);

  errorOf = (blockId: string): string | undefined => this.errors.get(blockId)?.message;

  errorDetailsOf = (blockId: string): ImageErrorInfo | undefined => this.errors.get(blockId);

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  start(blockId: string): void {
    this.errors.delete(blockId);
    this.active.add(blockId);
    this.notify();
  }

  finish(blockId: string, error?: string | ImageErrorInfo): void {
    const changed = this.active.delete(blockId);

    if (error) this.errors.set(blockId, typeof error === 'string' ? { message: error } : error);

    if (changed || error) this.notify();
  }

  clearError(blockId: string): void {
    if (this.errors.delete(blockId)) this.notify();
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
