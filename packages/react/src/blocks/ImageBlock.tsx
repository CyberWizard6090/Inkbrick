import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { isSafeImageUrl } from '@inkbrick/document';
import type { Editor } from '@inkbrick/engine';

import { useEditorView } from '../hooks/useEditorView';
import { useT } from '../hooks/useT';
import type { MessageKey } from '../i18n/en';
import { Icon, type IconName } from '../icons/Icon';
import { formatImageError } from '../images/ImageError';
import { fillImageBlock } from '../images/insertImages';
import { normalizeImageUrl } from '../images/upload';
import { DEFAULT_IMAGE_TYPES } from '../images/types';
import { useEditorUI } from '../ui/EditorUIContext';
import type { BlockViewProps } from '../ui/types';

const WIDTHS = [25, 50, 75, 100];
const ALIGNS: ReadonlyArray<{ value: string; label: MessageKey; icon: IconName }> = [
  { value: 'left', label: 'image.align.left', icon: 'align-left' },
  { value: 'center', label: 'image.align.center', icon: 'align-center' },
  { value: 'right', label: 'image.align.right', icon: 'align-right' },
];

const setProps = (editor: Editor, blockId: string, props: Record<string, unknown>) =>
  editor.dispatch({ type: 'setBlockProps', payload: { blockId, props: props as never } });

/** Поле, которое сохраняется по Enter/потере фокуса, а не на каждую букву (одна запись в истории). */
function CommitInput({
  value,
  label,
  placeholder,
  className,
  part,
  onCommit,
}: {
  value: string;
  label: string;
  placeholder: string;
  className: string;
  part: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  // Последнее сохранённое/известное значение: Enter сохраняет и тут же снимает фокус, а blur не должен сохранить второй раз.
  const saved = useRef(value);
  const cancelled = useRef(false);

  useEffect(() => {
    saved.current = value;
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }

    if (draft !== saved.current) {
      saved.current = draft;
      onCommit(draft);
    }
  };

  return (
    <input
      className={className}
      data-inkbrick-part={part}
      type="text"
      aria-label={label}
      placeholder={placeholder}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
          (event.target as HTMLInputElement).blur();
        } else if (event.key === 'Escape') {
          cancelled.current = true;
          setDraft(saved.current);
          (event.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function ImagePicker({ blockId, editor }: { blockId: string; editor: Editor }) {
  const view = useEditorView();
  const t = useT();
  const { images } = useEditorUI();
  const [url, setUrl] = useState('');
  const [linkError, setLinkError] = useState<MessageKey | null>(null);
  const uploadError = useSyncExternalStore(
    view.uploads.subscribe,
    () => view.uploads.errorDetailsOf(blockId),
    () => undefined,
  );
  const error = linkError ? t(linkError) : uploadError ? formatImageError(uploadError, t) : null;
  const file = useRef<HTMLInputElement>(null);

  const embed = () => {
    const normalized = normalizeImageUrl(url);

    if (!normalized) {
      setLinkError('image.error.invalidLink');
      return;
    }

    if (
      editor.dispatch({
        type: 'setBlockProps',
        payload: { blockId, props: { src: normalized } },
      }) === undefined
    ) {
      setLinkError('image.error.unsupportedAddress');
    }
  };

  const upload = async (selected: File | undefined) => {
    if (!selected) return;

    setLinkError(null);
    await fillImageBlock(editor, view, images, blockId, selected);
  };

  return (
    <div className="image-picker" data-inkbrick-part="picker" data-testid="image-picker">
      <div className="image-picker__row" data-inkbrick-part="picker-row">
        <input
          className="image-picker__input"
          data-inkbrick-part="picker-input"
          type="text"
          aria-label={t('image.url.label')}
          aria-invalid={linkError !== null}
          placeholder={t('image.url.placeholder')}
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            setLinkError(null);
            view.uploads.clearError(blockId);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              embed();
            }
          }}
        />
        <button
          type="button"
          className="image-picker__button"
          data-inkbrick-part="picker-button"
          onClick={embed}
        >
          {t('image.embed')}
        </button>
        <button
          type="button"
          className="image-picker__button"
          onClick={() => file.current?.click()}
        >
          {t('image.upload')}
        </button>
        <input
          ref={file}
          type="file"
          hidden
          data-testid="image-file"
          accept={(images.acceptedTypes ?? DEFAULT_IMAGE_TYPES).join(',')}
          onChange={(event) => {
            void upload(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>
      {error && (
        <div className="image-picker__error" data-inkbrick-part="picker-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

export function ImageBlock({ block, editor, selected, readOnly }: BlockViewProps) {
  const view = useEditorView();
  const t = useT();
  const uploading = useSyncExternalStore(
    view.uploads.subscribe,
    () => view.uploads.has(block.id),
    () => false,
  );

  const { src, alt, caption } = block.props as { src?: string; alt?: string; caption?: string };
  const width = typeof block.props.width === 'number' ? block.props.width : 100;
  const align = typeof block.props.align === 'string' ? block.props.align : 'center';
  const address = typeof src === 'string' ? src : '';

  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [address]);

  let content;

  if (uploading) {
    content = (
      <div className="image-status" data-inkbrick-part="status" data-state="loading" role="status">
        {t('image.status.uploading')}
      </div>
    );
  } else if (address === '') {
    content = readOnly ? (
      <div className="image-status" data-inkbrick-part="status" data-state="empty">
        {t('image.status.none')}
      </div>
    ) : (
      <ImagePicker blockId={block.id} editor={editor} />
    );
  } else if (!isSafeImageUrl(address)) {
    content = (
      <div
        className="image-status image-status--error"
        data-inkbrick-part="status"
        data-state="error"
      >
        {t('image.status.unsupported')}
      </div>
    );
  } else if (failed) {
    content = (
      <div
        className="image-status image-status--error"
        data-inkbrick-part="status"
        data-state="error"
        role="alert"
      >
        {t('image.status.failed')}
        {!readOnly && (
          <button
            type="button"
            className="image-picker__button"
            data-inkbrick-part="picker-button"
            onClick={() => setProps(editor, block.id, { src: '' })}
          >
            {t('image.status.retry')}
          </button>
        )}
      </div>
    );
  } else {
    content = (
      <figure
        className="image-figure"
        data-inkbrick-part="figure"
        data-align={align}
        style={{ width: `${width}%` }}
      >
        <img
          src={address}
          alt={alt ?? ''}
          loading="lazy"
          decoding="async"
          draggable={false}
          data-inkbrick-part="image"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />

        {!readOnly && (
          <div
            className="image-tools"
            data-inkbrick-part="tools"
            role="toolbar"
            aria-label={t('image.options')}
          >
            {ALIGNS.map(({ value, label, icon }) => (
              <button
                key={value}
                type="button"
                className="image-tools__button"
                data-inkbrick-part="tool"
                data-pressed={align === value || undefined}
                aria-label={t(label)}
                aria-pressed={align === value}
                title={t(label)}
                onClick={() => setProps(editor, block.id, { align: value })}
              >
                <Icon name={icon} />
              </button>
            ))}
            <select
              className="image-tools__select"
              data-inkbrick-part="width"
              aria-label={t('image.width')}
              value={WIDTHS.includes(width) ? width : ''}
              onChange={(event) =>
                setProps(editor, block.id, { width: Number(event.target.value) })
              }
            >
              {!WIDTHS.includes(width) && <option value="">{width}%</option>}
              {WIDTHS.map((w) => (
                <option key={w} value={w}>
                  {w}%
                </option>
              ))}
            </select>
            <CommitInput
              className="image-tools__alt"
              part="alt"
              label={t('image.alt')}
              placeholder={t('image.alt')}
              value={alt ?? ''}
              onCommit={(value) => setProps(editor, block.id, { alt: value })}
            />
            <button
              type="button"
              className="image-tools__button"
              data-inkbrick-part="tool"
              aria-label={t('image.replace')}
              title={t('image.replace')}
              onClick={() => setProps(editor, block.id, { src: '' })}
            >
              <Icon name="replace" />
            </button>
          </div>
        )}

        {readOnly ? (
          caption ? (
            <figcaption className="image-caption" data-inkbrick-part="caption">
              {caption}
            </figcaption>
          ) : null
        ) : (
          <CommitInput
            className="image-caption image-caption--input"
            part="caption"
            label={t('image.caption.label')}
            placeholder={t('image.caption.placeholder')}
            value={caption ?? ''}
            onCommit={(value) => setProps(editor, block.id, { caption: value })}
          />
        )}
      </figure>
    );
  }

  return (
    <div
      className="block block-image"
      data-inkbrick-block="image"
      data-block-id={block.id}
      data-selected={selected || undefined}
      contentEditable={false}
    >
      {content}
    </div>
  );
}
