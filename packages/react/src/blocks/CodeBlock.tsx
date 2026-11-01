import { useEffect, useRef, useState } from 'react';

import { useT } from '../hooks/useT';
import { Icon } from '../icons/Icon';
import { Editable } from './Editable';
import type { BlockViewProps } from '../ui/types';

/**
 * Языки в выпадающем списке. Редактор хранит только `language`; подсветку делает `highlighter` провайдера
 * (по умолчанию встроенный — он знает эти языки и их псевдонимы).
 */
export const CODE_LANGUAGES = [
  'plain',
  'typescript',
  'javascript',
  'json',
  'html',
  'css',
  'python',
  'bash',
  'sql',
  'go',
  'rust',
  'java',
  'c',
  'cpp',
  'markdown',
  'yaml',
] as const;

export function CodeBlock({ block, editor, selected, readOnly }: BlockViewProps) {
  const t = useT();
  const language = typeof block.props.language === 'string' ? block.props.language : 'plain';
  const languages = CODE_LANGUAGES.includes(language as (typeof CODE_LANGUAGES)[number])
    ? CODE_LANGUAGES
    : [...CODE_LANGUAGES, language];

  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = () => {
    const text = block.content.map((node) => node.insert).join('');

    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      className="block block-code"
      data-inkbrick-block="code"
      data-block-id={block.id}
      data-language={language}
      data-selected={selected || undefined}
    >
      <div className="code-toolbar" data-inkbrick-part="toolbar" contentEditable={false}>
        <select
          className="code-language"
          data-inkbrick-part="language"
          aria-label={t('block.code.language')}
          disabled={readOnly}
          value={language}
          onChange={(event) =>
            editor.dispatch({
              type: 'setBlockProps',
              payload: { blockId: block.id, props: { language: event.target.value } },
            })
          }
        >
          {languages.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="code-copy"
          data-inkbrick-part="copy"
          data-state={copied ? 'copied' : undefined}
          aria-label={copied ? t('block.code.copied') : t('block.code.copy')}
          title={copied ? t('block.code.copied') : t('block.code.copy')}
          onClick={copy}
        >
          <Icon name={copied ? 'check' : 'copy'} />
        </button>
      </div>
      <Editable block={block} />
    </div>
  );
}
