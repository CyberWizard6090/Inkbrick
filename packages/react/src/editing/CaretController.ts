/**
 * В каком блоке сейчас стоит каретка (выделение свёрнуто). Подписка идёт на уровне блока: при переносе каретки
 * перерисовываются только два блока — тот, который она покинула, и тот, куда попала.
 */
export class CaretController {
  private blockId: string | null = null;

  private readonly listeners = new Set<() => void>();

  has = (blockId: string): boolean => this.blockId === blockId;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  set(blockId: string | null): void {
    if (this.blockId === blockId) return;

    this.blockId = blockId;

    for (const listener of [...this.listeners]) listener();
  }
}
