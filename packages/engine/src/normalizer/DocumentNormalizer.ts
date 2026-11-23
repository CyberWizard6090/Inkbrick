import type { BaseBlock, BlockId } from '@inkbrick/document';
import type { Transaction } from '@inkbrick/store';

import type { Engine } from '../editor/Engine';

/** Что видит правило: движок, транзакция правки и блок, который нужно привести в порядок. */
export interface NormalizeContext {
  readonly engine: Engine;
  readonly transaction: Transaction;
  readonly block: BaseBlock;
}

/**
 * Правило нормализации: приводит блок к инварианту (опустевшая колонка убирается, пустая заметка получает абзац,
 * объединения ячеек не выходят за таблицу). Правит через `engine.block` в той же транзакции — значит, откатывается и
 * отменяется вместе с правкой, которая его вызвала. Блок, который уже в порядке, правило не трогает.
 */
export interface NormalizeRule {
  /** Имя — для сообщения, если правила не могут договориться. */
  readonly name: string;
  /** Типы блоков, к которым относится правило; без него — ко всем. */
  readonly flavours?: readonly string[];
  /**
   * `late` — после остальных правил прохода: общий запасной вариант (пустой контейнер получает блок), которому
   * правило конкретного блока (опустевшая колонка убирается) может сделать ненужным.
   */
  readonly order?: 'normal' | 'late';
  normalize(context: NormalizeContext): void;
}

/** Сколько раз подряд правила могут менять документ, прежде чем это считается их взаимной ошибкой. */
const MAX_PASSES = 10;

/**
 * Нормализатор документа: набор правил, которые после каждой команды проверяют изменённые ею блоки, пока документ не
 * перестанет меняться (правило может изменить другие блоки — тогда проверяются и они). `normalizeAll` проверяет весь
 * документ: для документа из внешнего источника (импорт, совместная правка).
 */
export class DocumentNormalizer {
  private readonly rules: NormalizeRule[] = [];

  /** Добавляет правило; возвращает функцию, которая его убирает. */
  add(rule: NormalizeRule): () => void {
    this.rules.push(rule);

    return () => {
      const index = this.rules.indexOf(rule);

      if (index !== -1) this.rules.splice(index, 1);
    };
  }

  /** Нормализует блоки, изменённые в транзакции. */
  normalizeChanged(engine: Engine, transaction: Transaction): void {
    this.run(engine, transaction, transaction.getChangedBlocks());
  }

  /** Нормализует указанные блоки (например, изменённые предыдущей правкой). */
  normalizeBlocks(engine: Engine, transaction: Transaction, ids: readonly BlockId[]): void {
    this.run(engine, transaction, ids);
  }

  /** Нормализует все блоки документа. */
  normalizeAll(engine: Engine, transaction: Transaction): void {
    this.run(engine, transaction, Object.keys(engine.store.document.dump()));
  }

  private run(engine: Engine, transaction: Transaction, start: readonly BlockId[]): void {
    if (this.rules.length === 0) return;

    const ordered = [
      ...this.rules.filter((rule) => rule.order !== 'late'),
      ...this.rules.filter((rule) => rule.order === 'late'),
    ];
    let candidates = start;

    for (let pass = 0; candidates.length > 0; pass++) {
      if (pass === MAX_PASSES) {
        throw new Error(
          `Document normalization does not settle: the rules keep changing blocks (${ordered
            .map((rule) => rule.name)
            .join(', ')})`,
        );
      }

      // Блоки неизменяемы: другой объект — значит, блок изменён в этом проходе и проверяется снова.
      const before = new Map(
        transaction.getChangedBlocks().map((id) => [id, transaction.getBlock(id)] as const),
      );

      for (const rule of ordered) {
        for (const id of candidates) {
          const block = transaction.getBlock(id);

          if (!block || (rule.flavours && !rule.flavours.includes(block.flavour))) continue;

          rule.normalize({ engine, transaction, block });
        }
      }

      candidates = transaction
        .getChangedBlocks()
        .filter((id) => transaction.getBlock(id) !== before.get(id));
    }
  }
}

/**
 * Блок, который создаёт правило: с id, который зависит от родителя и места, а не случаен. Одна и та же нормализация у
 * разных участников совместной правки создаёт один и тот же блок, и после обмена патчами их не становится два.
 */
function createStable(
  engine: Engine,
  transaction: Transaction,
  flavour: string,
  parentId: BlockId,
): BaseBlock {
  const kind = flavour.replace('block:', '');
  let index = transaction.getBlock(parentId)?.children.length ?? 0;
  let id = `${kind}-${parentId}-${index}`;

  while (transaction.getBlock(id)) id = `${kind}-${parentId}-${++index}`;

  return { ...engine.block.create({ flavour, parentId }), id };
}

/** Пустой контейнер с `BlockSchema.fillWhenEmpty` (заметка, колонка) получает блок для ввода. */
export const fillEmptyContainers: NormalizeRule = {
  name: 'fillWhenEmpty',
  order: 'late',
  normalize({ engine, transaction, block }) {
    const fill = engine.schema.getBlockSchema(block.flavour)?.fillWhenEmpty;

    if (!fill || block.children.length > 0) return;

    engine.block.insert(
      transaction,
      block.id,
      0,
      createStable(engine, transaction, fill, block.id),
    );
  },
};

/**
 * Поддерево, которое нарушает проверку своей схемы (`BlockSchema.validate`), исправляется её же `repair`: таблица без
 * строк получает строку, короткие строки — ячейки. Такое бывает, когда сходятся одновременные правки (двое удалили по
 * строке из таблицы в две строки). Запасной вариант (`late`): правило конкретного блока (опустевшая колонка убирается)
 * может сделать починку ненужной.
 */
export const repairBySchema: NormalizeRule = {
  name: 'repairBySchema',
  order: 'late',
  normalize({ engine, transaction, block }) {
    // Проверка схемы смотрит на поддерево: правка строки или ячейки может сломать таблицу, поэтому проверяются и предки.
    for (let current: BaseBlock | undefined = block; current;) {
      const schema = engine.schema.getBlockSchema(current.flavour);

      if (
        schema?.validate &&
        schema.repair &&
        schema.validate(current, (id) => transaction.getBlock(id)).length > 0
      ) {
        schema.repair(current, {
          get: (id) => transaction.getBlock(id),
          append: (parentId, flavour) => {
            const child = createStable(engine, transaction, flavour, parentId);

            engine.block.insert(
              transaction,
              parentId,
              transaction.getBlock(parentId)!.children.length,
              child,
            );

            return transaction.getBlock(child.id)!;
          },
        });
      }

      current = current.parentId ? transaction.getBlock(current.parentId) : undefined;
    }
  },
};
