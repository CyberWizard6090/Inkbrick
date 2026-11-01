// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { HIGHLIGHT_LIMIT, highlightCode, normalizeLanguage } from '../src';
import { CODE_LANGUAGES } from '../src/blocks/CodeBlock';

const tokensOf = (code: string, language: string) =>
  highlightCode(code, language).map((token) => [code.slice(token.from, token.to), token.type]);

describe('normalizeLanguage', () => {
  it('maps aliases to canonical names and ignores case and spaces', () => {
    expect(normalizeLanguage('TS')).toBe('typescript');
    expect(normalizeLanguage(' tsx ')).toBe('typescript');
    expect(normalizeLanguage('sh')).toBe('bash');
    expect(normalizeLanguage('C++')).toBe('cpp');
    expect(normalizeLanguage('yml')).toBe('yaml');
    expect(normalizeLanguage('plain')).toBe('plain');
  });
});

describe('highlightCode: general', () => {
  it('returns nothing for plain, unknown languages and empty code', () => {
    expect(highlightCode('const a = 1', 'plain')).toEqual([]);
    expect(highlightCode('const a = 1', 'brainfuck')).toEqual([]);
    expect(highlightCode('', 'typescript')).toEqual([]);
  });

  it('skips very long code', () => {
    expect(highlightCode('x'.repeat(HIGHLIGHT_LIMIT + 1), 'typescript')).toEqual([]);
  });

  it('knows every language offered in the code block selector', () => {
    for (const language of CODE_LANGUAGES.filter((name) => name !== 'plain')) {
      expect(highlightCode('x', language), language).toBeDefined();
    }
  });
});

describe('highlightCode: TypeScript / JavaScript', () => {
  it('highlights keywords, strings, numbers, comments, functions and types', () => {
    const code =
      'const n: number = 42; // answer\nfunction greet(name: string) { return `hi ${name}`; }';

    expect(tokensOf(code, 'ts')).toEqual([
      ['const', 'keyword'],
      ['number', 'type'],
      ['42', 'number'],
      ['// answer', 'comment'],
      ['function', 'keyword'],
      ['greet', 'function'],
      ['string', 'type'],
      ['return', 'keyword'],
      ['`hi ${name}`', 'string'],
    ]);
  });

  it('distinguishes regular expressions from division', () => {
    expect(tokensOf('const r = /ab+c/gi;', 'js')).toContainEqual(['/ab+c/gi', 'regex']);
    expect(tokensOf('const x = a / b / c;', 'js').filter(([, type]) => type === 'regex')).toEqual(
      [],
    );
    expect(tokensOf('return /x/.test(y)', 'js')).toContainEqual(['/x/', 'regex']);
  });

  it('marks classes, decorators and PascalCase names', () => {
    const tokens = tokensOf('@Component()\nclass Foo extends Bar {}', 'ts');

    expect(tokens).toContainEqual(['@Component', 'meta']);
    expect(tokens).toContainEqual(['Foo', 'type']);
    expect(tokens).toContainEqual(['Bar', 'type']);
  });

  it('handles block comments, escaped quotes and unterminated strings', () => {
    expect(tokensOf('/* a\nb */ x', 'js')[0]).toEqual(['/* a\nb */', 'comment']);
    expect(tokensOf('"a\\"b" c', 'js')[0]).toEqual(['"a\\"b"', 'string']);
    expect(tokensOf('"oops\nlet x', 'js')).toEqual([
      ['"oops', 'string'],
      ['let', 'keyword'],
    ]);
  });
});

describe('highlightCode: Python', () => {
  it('highlights definitions, decorators, docstrings and prefixed strings', () => {
    const code =
      '@app.route("/")\ndef index(self):\n    """Doc."""\n    return f"a{1}" if True else None';
    const tokens = tokensOf(code, 'py');

    expect(tokens).toContainEqual(['@app.route', 'meta']);
    expect(tokens).toContainEqual(['def', 'keyword']);
    expect(tokens).toContainEqual(['index', 'function']);
    expect(tokens).toContainEqual(['"""Doc."""', 'string']);
    expect(tokens).toContainEqual(['f"a{1}"', 'string']);
    expect(tokens).toContainEqual(['True', 'constant']);
    expect(tokens).toContainEqual(['None', 'constant']);
  });

  it('does not fail on a string prefix at the very end of the text (typing `f`, `r`, `b`)', () => {
    for (const text of ['f', 'def f', 'x = r', 'print(b', 'rb', 'F']) {
      expect(() => highlightCode(text, 'python'), text).not.toThrow();
    }

    expect(tokensOf('x = f"a"', 'python')).toContainEqual(['f"a"', 'string']);
  });

  it('highlights hash comments', () => {
    expect(tokensOf('x = 1  # one', 'python')).toEqual([
      ['1', 'number'],
      ['# one', 'comment'],
    ]);
  });
});

describe('highlightCode: other languages', () => {
  it('Go', () => {
    const tokens = tokensOf('func main() {\n\tfmt.Println("hi", 3)\n}', 'go');

    expect(tokens).toContainEqual(['func', 'keyword']);
    expect(tokens).toContainEqual(['main', 'function']);
    expect(tokens).toContainEqual(['"hi"', 'string']);
  });

  it('Rust: macros, lifetimes, attributes and char literals', () => {
    const tokens = tokensOf(
      "#[derive(Debug)]\nfn f<'a>(x: &'a str) { println!(\"{}\", 'c'); }",
      'rust',
    );

    expect(tokens).toContainEqual(['#[derive(Debug)]', 'meta']);
    expect(tokens).toContainEqual(['fn', 'keyword']);
    expect(tokens).toContainEqual(["'a", 'type']);
    expect(tokens).toContainEqual(['println!', 'function']);
    expect(tokens).toContainEqual(["'c'", 'string']);
  });

  it('C: preprocessor lines and types', () => {
    const tokens = tokensOf('#include <stdio.h>\nint main(void) { return 0; }', 'c');

    expect(tokens[0]).toEqual(['#include <stdio.h>', 'meta']);
    expect(tokens).toContainEqual(['int', 'type']);
    expect(tokens).toContainEqual(['main', 'function']);
  });

  it('Bash: variables, flags, comments and builtins', () => {
    const tokens = tokensOf('# build\necho "$HOME" --flag $1 ${NAME}', 'sh');

    expect(tokens).toContainEqual(['# build', 'comment']);
    expect(tokens).toContainEqual(['echo', 'builtin']);
    expect(tokens).toContainEqual(['--flag', 'attribute']);
    expect(tokens).toContainEqual(['$1', 'variable']);
    expect(tokens).toContainEqual(['${NAME}', 'variable']);
  });

  it('SQL is case-insensitive and uses -- comments', () => {
    const tokens = tokensOf("SELECT name FROM users WHERE id = 1 -- who\nand x = 'a';", 'sql');

    expect(tokens).toContainEqual(['SELECT', 'keyword']);
    expect(tokens).toContainEqual(['FROM', 'keyword']);
    expect(tokens).toContainEqual(['-- who', 'comment']);
    expect(tokens).toContainEqual(['and', 'keyword']);
    expect(tokens).toContainEqual(["'a'", 'string']);
  });

  it('JSON: keys are properties, values are strings, numbers and constants', () => {
    expect(tokensOf('{"a": [1, 2.5e3, true, null], "b": "x"}', 'json')).toEqual([
      ['"a"', 'property'],
      ['1', 'number'],
      ['2.5e3', 'number'],
      ['true', 'constant'],
      ['null', 'constant'],
      ['"b"', 'property'],
      ['"x"', 'string'],
    ]);
  });

  it('YAML: keys, comments, strings and booleans', () => {
    const tokens = tokensOf(
      'name: Inkbrick # app\nitems:\n  - id: 1\n    on: true\n    s: "x"',
      'yml',
    );

    expect(tokens).toContainEqual(['name', 'property']);
    expect(tokens).toContainEqual(['# app', 'comment']);
    expect(tokens).toContainEqual(['items', 'property']);
    expect(tokens).toContainEqual(['id', 'property']);
    expect(tokens).toContainEqual(['1', 'number']);
    expect(tokens).toContainEqual(['true', 'constant']);
    expect(tokens).toContainEqual(['"x"', 'string']);
  });

  it('HTML: tags, attributes, strings, comments, entities and embedded script/style', () => {
    const code =
      '<!-- c --><a href="/x" disabled>T &amp; U</a><script>const a = 1;</script><style>p { color: red; }</style>';
    const tokens = tokensOf(code, 'html');

    expect(tokens).toContainEqual(['<!-- c -->', 'comment']);
    expect(tokens).toContainEqual(['<a', 'tag']);
    expect(tokens).toContainEqual(['href', 'attribute']);
    expect(tokens).toContainEqual(['"/x"', 'string']);
    expect(tokens).toContainEqual(['disabled', 'attribute']);
    expect(tokens).toContainEqual(['&amp;', 'constant']);
    expect(tokens).toContainEqual(['const', 'keyword']);
    expect(tokens).toContainEqual(['color', 'property']);
  });

  it('CSS: selectors, properties, values, at-rules and comments', () => {
    const code =
      '@media (min-width: 600px) { .box:hover { color: #fff; margin: 0 -2px !important; } } /* end */';
    const tokens = tokensOf(code, 'css');

    expect(tokens).toContainEqual(['@media', 'keyword']);
    expect(tokens).toContainEqual(['.box', 'function']);
    expect(tokens).toContainEqual([':hover', 'keyword']);
    expect(tokens).toContainEqual(['color', 'property']);
    expect(tokens).toContainEqual(['#fff', 'number']);
    expect(tokens).toContainEqual(['-2px', 'number']);
    expect(tokens).toContainEqual(['!important', 'keyword']);
    expect(tokens).toContainEqual(['/* end */', 'comment']);
  });

  it('Markdown: headings, emphasis, code, links, lists and fences', () => {
    const code = '# Title\n- **bold** `code` [text](http://x)\n```js\nlet x\n```';
    const tokens = tokensOf(code, 'md');

    expect(tokens).toContainEqual(['# Title', 'keyword']);
    expect(tokens).toContainEqual(['**bold**', 'keyword']);
    expect(tokens).toContainEqual(['`code`', 'string']);
    expect(tokens).toContainEqual(['[text]', 'function']);
    expect(tokens).toContainEqual(['(http://x)', 'string']);
    expect(tokens).toContainEqual(['let x', 'string']);
  });
});

describe('highlightCode: invariants', () => {
  const languages = [...CODE_LANGUAGES.filter((name) => name !== 'plain'), 'ts', 'sh', 'yml', 'md'];

  const check = (code: string, language: string) => {
    const tokens = highlightCode(code, language);
    let end = 0;

    for (const token of tokens) {
      expect(token.from, language).toBeGreaterThanOrEqual(end);
      expect(token.to, language).toBeGreaterThan(token.from);
      expect(token.to, language).toBeLessThanOrEqual(code.length);
      expect(token.type).toMatch(/^[a-z]+$/);

      end = token.to;
    }
  };

  it('holds for hand-written edge cases', () => {
    const samples = [
      '"',
      "'",
      '`',
      '/*',
      '/',
      '//',
      '#',
      '<',
      '<a',
      '<a href="',
      '<!--',
      '{',
      '}',
      '{{{{',
      '"""',
      '\\',
      '$',
      '${',
      '@',
      '-',
      '--',
      '\n\n\n',
      'a'.repeat(10),
      '😀 "юникод" 日本語',
    ];

    for (const language of languages) for (const sample of samples) check(sample, language);
  });

  it('holds for random strings made of syntax-heavy characters (fuzz)', () => {
    const alphabet = [
      'f',
      'r',
      'b',
      'u',
      "'",
      '"',
      '`',
      '/',
      '*',
      '#',
      '<',
      '>',
      '{',
      '}',
      '(',
      ')',
      '\\',
      '\n',
      ' ',
      '$',
      '@',
      '-',
      ':',
      '!',
      '=',
      'a',
      'if',
      '1',
      '.',
      '[',
      ']',
      '&',
      ';',
    ];
    let seed = 12345;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;

      return seed / 4294967296;
    };

    for (let run = 0; run < 150; run++) {
      let code = '';

      for (let i = 0, n = 1 + Math.floor(random() * 60); i < n; i++) {
        code += alphabet[Math.floor(random() * alphabet.length)];
      }

      for (const language of languages) check(code, language);
    }
  });
});
