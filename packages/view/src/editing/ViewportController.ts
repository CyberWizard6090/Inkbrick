/**
 * Какие блоки обязаны оставаться в DOM при виртуальной отрисовке: края выделения (там стоит каретка или
 * начинается/кончается выделение) и блоки, которые редактор попросил показать (`reveal`), например перед
 * установкой каретки в блок за пределами окна. Обычный рендерер это состояние не читает.
 */
export class ViewportController {
  private edges: readonly string[] = [];

  private revealed: readonly string[] = [];

  private lists = 0;

  private version = 0;

  private readonly listeners = new Set<() => void>();

  getVersion = (): number => this.version;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  getPinned(): readonly string[] {
    return this.revealed.length === 0 ? this.edges : [...this.edges, ...this.revealed];
  }

  get virtual(): boolean {
    return this.lists > 0;
  }

  attach(): () => void {
    this.lists += 1;

    return () => {
      this.lists -= 1;
    };
  }

  setEdges(ids: readonly string[]): void {
    if (ids.length === this.edges.length && ids.every((id, i) => this.edges[i] === id)) return;

    this.edges = ids;
    this.notify();
  }

  reveal(ids: readonly string[]): boolean {
    if (!this.virtual) return false;

    this.revealed = ids;
    this.notify();
    return true;
  }

  private notify(): void {
    this.version += 1;

    for (const listener of [...this.listeners]) listener();
  }
}
