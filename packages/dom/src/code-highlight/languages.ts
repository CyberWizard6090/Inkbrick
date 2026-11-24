import type { HighlightTokenType } from './types';

export interface LanguageDef {
  keywords?: string;
  types?: string;
  builtins?: string;
  constants?: string;
  ignoreCase?: boolean;
  lineComment?: readonly string[];
  /** Строчный комментарий начинается только в начале слова (bash: `#`, но не `$#`). */
  commentAtWordStart?: boolean;
  blockComment?: readonly [string, string];
  strings?: string;
  multiline?: string;
  triple?: boolean;
  stringPrefixes?: boolean;
  stringKeys?: boolean;
  regex?: boolean;
  preprocessor?: boolean;
  rustAttributes?: boolean;
  lifetimes?: boolean;
  at?: boolean;
  dollar?: boolean;
  flags?: boolean;
  macros?: boolean;
  pascalTypes?: boolean;
  declarations?: Readonly<Record<string, HighlightTokenType>>;
}

const JS_KEYWORDS =
  'break case catch class const continue debugger default delete do else enum export extends finally for function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async await from as implements interface package private protected public readonly abstract declare namespace keyof satisfies override';

const JS_DECLARATIONS = {
  function: 'function',
  class: 'type',
  interface: 'type',
  enum: 'type',
  namespace: 'type',
} as const;

const javascript: LanguageDef = {
  keywords: JS_KEYWORDS,
  constants: 'true false null undefined NaN Infinity',
  builtins:
    'console window document Math JSON Object Array String Number Boolean Promise Map Set WeakMap Date Error RegExp Symbol parseInt parseFloat require module exports process globalThis',
  lineComment: ['//'],
  blockComment: ['/*', '*/'],
  strings: '\'"`',
  multiline: '`',
  regex: true,
  at: true,
  pascalTypes: true,
  declarations: JS_DECLARATIONS,
};

const typescript: LanguageDef = {
  ...javascript,
  types:
    'string number boolean any unknown never void object bigint symbol Record Partial Required Readonly Pick Omit Awaited ReturnType',
};

const python: LanguageDef = {
  keywords:
    'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case',
  constants: 'True False None',
  builtins:
    'print len range int str float bool list dict set tuple type isinstance open enumerate zip map filter sorted sum min max abs any all input super self cls object Exception',
  lineComment: ['#'],
  strings: '\'"',
  triple: true,
  stringPrefixes: true,
  at: true,
  pascalTypes: true,
  declarations: { def: 'function', class: 'type' },
};

const go: LanguageDef = {
  keywords:
    'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var',
  types:
    'bool byte complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr any',
  constants: 'true false nil iota',
  builtins: 'append cap close copy delete len make new panic print println recover',
  lineComment: ['//'],
  blockComment: ['/*', '*/'],
  strings: '\'"`',
  multiline: '`',
  pascalTypes: true,
  declarations: { func: 'function', type: 'type' },
};

const rust: LanguageDef = {
  keywords:
    'as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while',
  types:
    'i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 bool char str String Vec Option Result Box Rc Arc',
  constants: 'true false None Some Ok Err',
  lineComment: ['//'],
  blockComment: ['/*', '*/'],
  strings: '"',
  multiline: '"',
  rustAttributes: true,
  lifetimes: true,
  macros: true,
  pascalTypes: true,
  declarations: { fn: 'function', struct: 'type', enum: 'type', trait: 'type', impl: 'type' },
};

const java: LanguageDef = {
  keywords:
    'abstract assert break case catch class continue default do else enum extends final finally for if implements import instanceof interface native new package private protected public return static strictfp super switch synchronized this throw throws transient try void volatile while var record sealed permits',
  types:
    'boolean byte char double float int long short String Integer Long Double Boolean Object List Map Set',
  constants: 'true false null',
  lineComment: ['//'],
  blockComment: ['/*', '*/'],
  strings: '\'"',
  at: true,
  pascalTypes: true,
  declarations: { class: 'type', interface: 'type', enum: 'type', record: 'type' },
};

const C_KEYWORDS =
  'auto break case const continue default do else enum extern for goto if inline register restrict return sizeof static struct switch typedef union volatile while';

const c: LanguageDef = {
  keywords: C_KEYWORDS,
  types:
    'void char short int long float double signed unsigned size_t bool _Bool int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t FILE',
  constants: 'NULL true false EOF',
  lineComment: ['//'],
  blockComment: ['/*', '*/'],
  strings: '\'"',
  preprocessor: true,
  declarations: { struct: 'type', enum: 'type', union: 'type' },
};

const cpp: LanguageDef = {
  ...c,
  keywords: `${C_KEYWORDS} class namespace template typename public private protected virtual override final new delete this using try catch throw operator constexpr noexcept static_cast dynamic_cast reinterpret_cast const_cast explicit friend mutable decltype`,
  types: `${c.types} string vector map set unique_ptr shared_ptr std`,
  constants: 'NULL nullptr true false EOF',
  pascalTypes: true,
  declarations: { class: 'type', struct: 'type', enum: 'type', namespace: 'type', union: 'type' },
};

const bash: LanguageDef = {
  keywords:
    'if then else elif fi for while until do done case esac in function select time return exit break continue export local readonly declare unset source alias set shift',
  builtins:
    'echo cd ls pwd cat grep sed awk rm cp mv mkdir touch chmod chown curl wget git npm pnpm yarn node python docker sudo kill ps tar test read printf eval exec trap true false',
  lineComment: ['#'],
  commentAtWordStart: true,
  strings: '\'"`',
  multiline: '\'"`',
  dollar: true,
  flags: true,
};

const sql: LanguageDef = {
  ignoreCase: true,
  keywords:
    'select from where and or not in is like between exists distinct as join inner left right full outer cross on using group by order having limit offset union all insert into values update set delete create alter drop table index view database schema primary key foreign references unique default check constraint add column case when then else end begin commit rollback transaction with returning asc desc if cascade truncate grant revoke',
  types:
    'int integer bigint smallint tinyint varchar char text boolean bool date time timestamp datetime numeric decimal float double real serial uuid json jsonb blob',
  constants: 'true false null',
  builtins:
    'count sum avg min max coalesce now cast length lower upper trim round abs concat substring',
  lineComment: ['--'],
  blockComment: ['/*', '*/'],
  strings: '\'"',
};

const json: LanguageDef = {
  constants: 'true false null',
  lineComment: ['//'],
  blockComment: ['/*', '*/'],
  strings: '"',
  stringKeys: true,
};

const yaml: LanguageDef = {
  constants: 'true false null yes no on off ~ True False Null',
  lineComment: ['#'],
  commentAtWordStart: true,
  strings: '\'"',
};

export const LANGUAGES: Readonly<Record<string, LanguageDef>> = {
  javascript,
  typescript,
  python,
  go,
  rust,
  java,
  c,
  cpp,
  bash,
  sql,
  json,
  yaml,
};

export const ALIASES: Readonly<Record<string, string>> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  golang: 'go',
  rs: 'rust',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  'c++': 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  h: 'c',
  jsonc: 'json',
  json5: 'json',
  yml: 'yaml',
  md: 'markdown',
  xml: 'html',
  svg: 'html',
  htm: 'html',
  scss: 'css',
  less: 'css',
  postgres: 'sql',
  postgresql: 'sql',
  mysql: 'sql',
  sqlite: 'sql',
};
