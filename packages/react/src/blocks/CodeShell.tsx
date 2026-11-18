import { useEffect, useId, useRef, useState, type ComponentType } from 'react';

import type { BlockViewProps } from '../ui/types';
import { Editable } from './Editable';

export interface CodeToolbarProps {
  readonly language: string;
  readonly readOnly: boolean;
  readonly collapsed: boolean;
  readonly bodyId: string;
  readonly lines: number;
  readonly showCaption: boolean;
  readonly copied: boolean;
  readonly onToggle: () => void;
  readonly onCopy: () => void;
  readonly onAddCaption: () => void;
  readonly onLanguage: (language: string) => void;
}

export interface CodeCaptionProps {
  readonly caption: string;
  readonly captionOpen: boolean;
  readonly readOnly: boolean;
  readonly onCommit: (value: string) => void;
  readonly onDone: (value: string) => void;
}

export interface CodeShellProps extends BlockViewProps {
  /** Панель (свёртка, язык, копирование); `null` — пока её чанк грузится: блок уже принимает ввод. */
  readonly Toolbar: ComponentType<CodeToolbarProps> | null;
  readonly Caption: ComponentType<CodeCaptionProps> | null;
}

/**
 * Каркас блока кода: оболочка, свёртка, подпись и сам текст (`Editable`). Панель и подпись приходят снаружи: в
 * `LazyCodeBlock` они из отдельного чанка. Текст стоит в каркасе, а не в панели, поэтому, когда чанк пришёл и панель
 * появилась, поле ввода остаётся тем же элементом DOM, каретка и набранные символы не теряются.
 */
export function CodeShell({ block, editor, selected, readOnly, Toolbar, Caption }: CodeShellProps) {
  const bodyId = useId();
  const language = typeof block.props.language === 'string' ? block.props.language : 'plain';
  const caption = typeof block.props.caption === 'string' ? block.props.caption : '';
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

  return (
    <div
      className="block block-code"
      data-inkbrick-block="code"
      data-block-id={block.id}
      data-language={language}
      data-collapsed={collapsed || undefined}
      data-selected={selected || undefined}
    >
      <div
        className="code-toolbar"
        data-inkbrick-part="toolbar"
        data-loading={Toolbar ? undefined : ''}
        contentEditable={false}
      >
        {Toolbar && (
          <Toolbar
            language={language}
            readOnly={!!readOnly}
            collapsed={collapsed}
            bodyId={bodyId}
            lines={code().split('\n').length}
            showCaption={showCaption}
            copied={copied}
            onToggle={toggle}
            onCopy={copy}
            onAddCaption={() => setCaptionOpen(true)}
            onLanguage={(value) => setProps({ language: value })}
          />
        )}
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
      {showCaption && Caption && (
        <Caption
          caption={caption}
          captionOpen={captionOpen}
          readOnly={!!readOnly}
          onCommit={(value) => setProps({ caption: value })}
          onDone={(value) => {
            if (value === '') setCaptionOpen(false);
          }}
        />
      )}
    </div>
  );
}
