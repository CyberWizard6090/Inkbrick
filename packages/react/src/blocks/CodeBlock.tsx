import { useEffect, useId, useRef, useState } from 'react';

import { useT } from '../hooks/useT';
import { Icon } from '../icons/Icon';
import { Select } from '../ui/Select';
import { CommitInput } from './CommitInput';
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

const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  json: 'JSON',
  html: 'HTML',
  css: 'CSS',
  python: 'Python',
  bash: 'Bash',
  sql: 'SQL',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  markdown: 'Markdown',
  yaml: 'YAML',
};

export function CodeBlock({ block, editor, selected, readOnly }: BlockViewProps) {
  const t = useT();
  const bodyId = useId();
  const language = typeof block.props.language === 'string' ? block.props.language : 'plain';
  const caption = typeof block.props.caption === 'string' ? block.props.caption : '';
  const languages = CODE_LANGUAGES.includes(language as (typeof CODE_LANGUAGES)[number])
    ? CODE_LANGUAGES
    : [...CODE_LANGUAGES, language];
  const options = languages.map((name) => ({
    value: name,
    label: name === 'plain' ? t('block.code.plain') : (LANGUAGE_NAMES[name] ?? name),
  }));

  const [localCollapsed, setLocalCollapsed] = useState<boolean | undefined>(undefined);
  const collapsed = (readOnly ? localCollapsed : undefined) ?? block.props.collapsed === true;
  const [captionOpen, setCaptionOpen] = useState(false);
  const showCaption = caption !== '' || captionOpen;

  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const setProps = (props: Record<string, unknown>) =>
    editor.dispatch({
      type: 'setBlockProps',
      payload: { blockId: block.id, props: props as never },
    });

  const code = () => block.content.map((node) => node.insert).join('');

  const copy = () => {
    void navigator.clipboard?.writeText(code()).then(() => {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    });
  };

  const toggle = () => {
    const next = !collapsed;

    if (next) {
      const selection = window.getSelection();
      const body = document.getElementById(bodyId);

      if (selection?.anchorNode && body?.contains(selection.anchorNode))
        selection.removeAllRanges();
    }

    if (readOnly) setLocalCollapsed(next);
    else setProps({ collapsed: next });
  };

  const lines = code().split('\n').length;

  return (
    <div
      className="block block-code"
      data-inkbrick-block="code"
      data-block-id={block.id}
      data-language={language}
      data-collapsed={collapsed || undefined}
      data-selected={selected || undefined}
    >
      <div className="code-toolbar" data-inkbrick-part="toolbar" contentEditable={false}>
        <button
          type="button"
          className="code-collapse"
          data-inkbrick-part="collapse"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          aria-label={collapsed ? t('block.code.expand') : t('block.code.collapse')}
          title={collapsed ? t('block.code.expand') : t('block.code.collapse')}
          onClick={toggle}
        >
          <Icon name="chevron-down" />
        </button>
        <Select
          className="code-language"
          part="language"
          label={t('block.code.language')}
          disabled={readOnly}
          value={language}
          options={options}
          onChange={(value) => setProps({ language: value })}
        />
        {collapsed && (
          <span className="code-summary" data-inkbrick-part="summary">
            {t('block.code.lines', { count: lines })}
          </span>
        )}
        <span data-inkbrick-part="spacer" />
        {!readOnly && !showCaption && (
          <button
            type="button"
            className="code-caption-toggle"
            data-inkbrick-part="caption-toggle"
            aria-label={t('block.code.addCaption')}
            title={t('block.code.addCaption')}
            onClick={() => setCaptionOpen(true)}
          >
            <Icon name="captions" />
          </button>
        )}
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
      <div
        id={bodyId}
        data-inkbrick-part="body"
        aria-hidden={collapsed || undefined}
        contentEditable={collapsed ? false : undefined}
      >
        <div data-inkbrick-part="body-inner">
          <Editable block={block} />
        </div>
      </div>
      {showCaption &&
        (readOnly ? (
          <div className="code-caption" data-inkbrick-part="caption">
            {caption}
          </div>
        ) : (
          <div data-inkbrick-part="caption-row" contentEditable={false}>
            <CommitInput
              className="code-caption code-caption--input"
              part="caption"
              label={t('block.code.caption.label')}
              placeholder={t('block.code.caption.placeholder')}
              value={caption}
              autoFocus={captionOpen && caption === ''}
              onCommit={(value) => setProps({ caption: value })}
              onDone={(value) => {
                if (value === '') setCaptionOpen(false);
              }}
            />
          </div>
        ))}
    </div>
  );
}
