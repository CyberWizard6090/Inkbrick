export interface TextAttributes {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  link?: string;
  color?: string;
  backgroundColor?: string;
  /** Встроенная формула: код LaTeX. Узел с этим атрибутом состоит из символов-объектов `FORMULA_CHAR`. */
  formula?: string;
  /** Ссылка на сноску: код сноски (`block:footnote` с тем же `id`). Узел состоит из символов-объектов `FORMULA_CHAR`. */
  footnote?: string;
  [key: string]: string | boolean | undefined;
}

export interface InlineNode {
  insert: string;
  attributes?: TextAttributes;
}

export interface InlineOp {
  retain?: number;
  delete?: number;
  insert?: string;
  attributes?: TextAttributes;
}
