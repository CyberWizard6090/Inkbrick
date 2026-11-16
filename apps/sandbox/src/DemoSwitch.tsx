export type Demo = 'editor' | 'table';

const DEMOS: ReadonlyArray<{ readonly id: Demo; readonly href: string; readonly label: string }> = [
  { id: 'editor', href: '?', label: 'Editor' },
  { id: 'table', href: '?demo=table', label: 'Table editor' },
];

/** Переключатель между примерами песочницы: обычный редактор документа и отдельный редактор таблицы. */
export function DemoSwitch({ current }: { readonly current: Demo }) {
  return (
    <nav className="demo-switch" aria-label="Demo">
      {DEMOS.map(({ id, href, label }) => (
        <a
          key={id}
          href={href}
          data-testid={`demo-${id}`}
          aria-current={id === current ? 'page' : undefined}
          className={id === current ? 'is-active' : undefined}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
