import { useEffect, useRef, useState } from 'react';

export interface CommitInputProps {
  readonly value: string;
  readonly label: string;
  readonly placeholder: string;
  readonly className: string;
  readonly part: string;
  readonly autoFocus?: boolean;
  onCommit(value: string): void;
  onDone?(value: string): void;
}

export function CommitInput({
  value,
  label,
  placeholder,
  className,
  part,
  autoFocus,
  onCommit,
  onDone,
}: CommitInputProps) {
  const [draft, setDraft] = useState(value);
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
      autoFocus={autoFocus}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        commit();
        onDone?.(saved.current);
      }}
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
