import {
  normalizeInlineNodes,
  splitNodesAt,
  type InlineNode,
  type TextAttributes,
} from '@inkbrick/document';

/**
 * Чистые функции над содержимым блока (InlineNode[]). Ничего не мутируют —
 * всегда возвращают новый массив, поэтому результат можно безопасно класть в store.
 */
export class InlineEngine {
  length(nodes: readonly InlineNode[]): number {
    return nodes.reduce((sum, node) => sum + node.insert.length, 0);
  }

  toPlainText(nodes: readonly InlineNode[]): string {
    return nodes.map((node) => node.insert).join('');
  }

  fromText(text: string, attributes?: TextAttributes): InlineNode[] {
    return normalizeInlineNodes([{ insert: text, ...(attributes ? { attributes } : {}) }]);
  }

  insertText(
    nodes: readonly InlineNode[],
    offset: number,
    text: string,
    attributes?: TextAttributes,
  ): InlineNode[] {
    if (text.length === 0) return normalizeInlineNodes([...nodes]);

    const position = this.clamp(nodes, offset);
    const split = splitNodesAt([...nodes], position);

    let index = split.length;
    let current = 0;

    for (let i = 0; i < split.length; i++) {
      if (current === position) {
        index = i;
        break;
      }
      current += split[i].insert.length;
    }

    split.splice(index, 0, { insert: text, ...(attributes ? { attributes } : {}) });

    return normalizeInlineNodes(split);
  }

  deleteText(nodes: readonly InlineNode[], from: number, to: number): InlineNode[] {
    const start = this.clamp(nodes, Math.min(from, to));
    const end = this.clamp(nodes, Math.max(from, to));

    if (start === end) return normalizeInlineNodes([...nodes]);

    const split = splitNodesAt([...nodes], start, end);
    let current = 0;

    const kept = split.filter((node) => {
      const nodeStart = current;
      current += node.insert.length;
      return !(nodeStart >= start && current <= end);
    });

    return normalizeInlineNodes(kept);
  }

  attributesBefore(nodes: readonly InlineNode[], offset: number): TextAttributes | undefined {
    let current = 0;

    for (const node of nodes) {
      const end = current + node.insert.length;
      if (offset > current && offset <= end) return node.attributes;
      current = end;
    }

    return undefined;
  }

  hasFormat(nodes: readonly InlineNode[], from: number, to: number, key: string): boolean {
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    let current = 0;
    let covered = false;

    for (const node of nodes) {
      const nodeStart = current;
      current += node.insert.length;

      if (current <= start || nodeStart >= end) continue;

      covered = true;
      if (!node.attributes?.[key]) return false;
    }

    return covered;
  }

  split(nodes: readonly InlineNode[], offset: number): [InlineNode[], InlineNode[]] {
    const position = this.clamp(nodes, offset);
    const split = splitNodesAt([...nodes], position);

    const left: InlineNode[] = [];
    const right: InlineNode[] = [];
    let current = 0;

    for (const node of split) {
      if (current < position) left.push(node);
      else right.push(node);
      current += node.insert.length;
    }

    return [normalizeInlineNodes(left), normalizeInlineNodes(right)];
  }

  merge(a: readonly InlineNode[], b: readonly InlineNode[]): InlineNode[] {
    return normalizeInlineNodes([...a, ...b]);
  }

  format(
    nodes: readonly InlineNode[],
    from: number,
    to: number,
    attributes: Partial<TextAttributes>,
  ): InlineNode[] {
    const start = this.clamp(nodes, Math.min(from, to));
    const end = this.clamp(nodes, Math.max(from, to));

    if (start === end) return normalizeInlineNodes([...nodes]);

    const split = splitNodesAt([...nodes], start, end);
    let current = 0;

    const result = split.map((node) => {
      const nodeStart = current;
      current += node.insert.length;

      if (nodeStart < start || current > end) return node;

      const merged: TextAttributes = { ...node.attributes, ...attributes };

      for (const key of Object.keys(merged)) {
        if (merged[key] === undefined || merged[key] === false) delete merged[key];
      }

      return {
        insert: node.insert,
        ...(Object.keys(merged).length > 0 ? { attributes: merged } : {}),
      };
    });

    return normalizeInlineNodes(result);
  }

  normalize(nodes: readonly InlineNode[]): InlineNode[] {
    return normalizeInlineNodes([...nodes]);
  }

  private clamp(nodes: readonly InlineNode[], offset: number): number {
    return Math.max(0, Math.min(offset, this.length(nodes)));
  }
}
