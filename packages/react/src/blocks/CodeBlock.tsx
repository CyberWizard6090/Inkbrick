import { useT } from '../hooks/useT';
import { Icon } from '../icons/Icon';
import { Select } from '../ui/Select';
import { CommitInput } from './CommitInput';
import { CodeShell, type CodeCaptionProps, type CodeToolbarProps } from './CodeShell';
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

/** Панель блока кода: свёртка, язык, подпись, копирование. Лежит в отдельном чанке вместе с выбором языка. */
export function CodeToolbar({
  language,
  readOnly,
  collapsed,
  bodyId,
  lines,
  showCaption,
  copied,
  onToggle,
  onCopy,
  onAddCaption,
  onLanguage,
}: CodeToolbarProps) {
  const t = useT();
  const languages = CODE_LANGUAGES.includes(language as (typeof CODE_LANGUAGES)[number])
    ? CODE_LANGUAGES
    : [...CODE_LANGUAGES, language];
  const options = languages.map((name) => ({
    value: name,
    label: name === 'plain' ? t('block.code.plain') : (LANGUAGE_NAMES[name] ?? name),
  }));

  return (
    <>
      <button
        type="button"
        className="code-collapse"
        data-inkbrick-part="collapse"
        aria-expanded={!collapsed}
        aria-controls={bodyId}
        aria-label={collapsed ? t('block.code.expand') : t('block.code.collapse')}
        title={collapsed ? t('block.code.expand') : t('block.code.collapse')}
        onClick={onToggle}
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
        onChange={onLanguage}
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
          onClick={onAddCaption}
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
        onClick={onCopy}
      >
        <Icon name={copied ? 'check' : 'copy'} />
      </button>
    </>
  );
}

/** Подпись блока кода: поле ввода или текст в режиме чтения. */
export function CodeCaption({
  caption,
  captionOpen,
  readOnly,
  onCommit,
  onDone,
}: CodeCaptionProps) {
  const t = useT();

  return readOnly ? (
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
        onCommit={onCommit}
        onDone={onDone}
      />
    </div>
  );
}

/** Блок кода целиком, с панелью и подписью сразу (для своих реестров компонентов). */
export function CodeBlock(props: BlockViewProps) {
  return <CodeShell {...props} Toolbar={CodeToolbar} Caption={CodeCaption} />;
}
