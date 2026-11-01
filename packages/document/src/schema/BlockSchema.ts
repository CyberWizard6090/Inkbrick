import type { ZodTypeAny } from 'zod';
import type { BlockFlavour } from '../model/BlockFlavour';
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

  commands: string[];
  shortcuts: string[];
  rendererHint: string;
}
