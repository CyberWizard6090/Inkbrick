import type { ZodTypeAny } from 'zod';
import type { BlockFlavour } from '../model/BlockFlavour';
import type { BaseBlock } from '../model/BaseBlock';
import type { BlockProps } from '../model/BlockProps';

/**
 * Роль блока в дереве:
 * - `root` — корень документа (page); не может лежать ни в каком блоке;
 * - `hub` — контейнер содержимого без собственного текста (note);
 * - `content` — обычный блок содержимого (по умолчанию).
 */
export type BlockRole = 'root' | 'hub' | 'content';

/**
 * Ограничение на родителя/потомка: список flavour (элемент `'role:hub'` — любой блок с этой ролью),
 * '*' (любой) или предикат.
 */
export type FlavourConstraint = string[] | '*' | ((flavour: string) => boolean);

export interface EnterBehavior {
  /**
   * 'split' (по умолчанию) — делит блок на два;
   * 'newline' — вставляет перевод строки, а Enter на пустой последней строке выходит из блока (код).
   */
  mode?: 'split' | 'newline';
  /** Тип блока, который создаётся после Enter (по умолчанию — тот же). Например, после заголовка — параграф. */
  nextFlavour?: BlockFlavour;
  /** Enter в пустом блоке превращает его в параграф (списки, цитаты). */
  exitWhenEmpty?: boolean;
}

/** Блок, который создаётся вместе с родителем (см. `BlockSchema.scaffold`). */
export interface BlockTemplate {
  flavour: BlockFlavour;
  props?: BlockProps;
  children?: readonly BlockTemplate[];
}

/** Что доступно `BlockSchema.repair`: чтение блоков и добавление недостающих потомков. */
export interface RepairTree {
  get(id: string): BaseBlock | undefined;
  /** Создаёт пустой блок `flavour` последним потомком `parentId` и возвращает его. */
  append(parentId: string, flavour: BlockFlavour): BaseBlock;
}

export interface BlockSchema<TPropsSchema extends ZodTypeAny = ZodTypeAny> {
  flavour: BlockFlavour;
  name: string;
  icon: string;
  propsSchema: TPropsSchema;

  /** Роль в дереве (по умолчанию `content`). Позволяет писать правила вложенности как `'role:hub'`. */
  role?: BlockRole;

  /** Версия формата props (по умолчанию 1). Увеличивайте при несовместимой смене props и добавляйте `migrate`. */
  version?: number;

  /**
   * Приводит props, сохранённые версией `fromVersion`, к текущей `version`. Вызывается при загрузке снимка
   * (`deserializeDocument`) только для устаревших блоков; результат проверяется `propsSchema`.
   */
  migrate?: (props: BlockProps, fromVersion: number) => BlockProps;

  allowedParents: FlavourConstraint;
  allowedChildren: FlavourConstraint;

  /**
   * Хранит ли блок редактируемый текст (inline content). По умолчанию true;
   * контейнеры (page, note) задают false. Нужен операциям над выделением из нескольких блоков.
   */
  inline?: boolean;

  /** Можно ли вкладывать блок Tab-ом в предыдущий соседний блок (списки). По умолчанию false. */
  indentable?: boolean;

  enter?: EnterBehavior;

  /**
   * Блок — неделимая часть составного блока (строка и ячейка таблицы). Общие правки его не удаляют,
   * не склеивают с соседями, не делят, не переносят и не дублируют: Backspace в начале ничего не делает,
   * удаление выделения только очищает его текст, вставка из буфера идёт текстом. Количество и порядок таких
   * блоков меняют только команды владельца (таблицы).
   */
  isolating?: boolean;

  /**
   * Начальные потомки блока, созданного пользователем (`insertBlock`, `convertBlock`): таблица 3×3 вместо
   * пустой. При вставке из буфера, дублировании и загрузке не применяется — там потомки уже есть.
   */
  scaffold?: (props: BlockProps) => readonly BlockTemplate[];

  /**
   * Проверка поддерева, которую не выразить правилами вложенности (в строках таблицы поровну ячеек).
   * Возвращает описания нарушений; вызывается из `validateSnapshot`.
   */
  validate?: (block: BaseBlock, getBlock: (id: string) => BaseBlock | undefined) => string[];

  /**
   * Исправляет то, что находит `validate` (дополняет короткие строки таблицы ячейками). Вызывается из
   * `repairSnapshot`; возвращает описания правок.
   */
  repair?: (block: BaseBlock, tree: RepairTree) => string[];

  commands: string[];
  shortcuts: string[];
  rendererHint: string;
}
