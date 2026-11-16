import { useSandboxI18n, type SandboxKey } from './i18n';

export type Demo = 'editor' | 'table';

const DEMOS: ReadonlyArray<{
  readonly id: Demo;
  readonly href: string;
  readonly label: SandboxKey;
}> = [
  { id: 'editor', href: '?', label: 'demo.editor' },
  { id: 'table', href: '?demo=table', label: 'demo.table' },
];

/** Адрес примера с сохранением языка: смена примера не должна сбрасывать выбранный язык. */
function hrefOf(base: string): string {
  const lang = new URLSearchParams(window.location.search).get('lang');
  const params = new URLSearchParams(base.slice(1));

  if (lang) params.set('lang', lang);

  const query = params.toString();

  return query ? `?${query}` : window.location.pathname;
}

/** Переключатель между примерами песочницы: обычный редактор документа и отдельный редактор таблицы. */
export function DemoSwitch({ current }: { readonly current: Demo }) {
  const { t } = useSandboxI18n();

  return (
    <nav className="demo-switch" aria-label={t('demo.label')}>
      {DEMOS.map(({ id, href, label }) => (
        <a
          key={id}
          href={hrefOf(href)}
          data-testid={`demo-${id}`}
          aria-current={id === current ? 'page' : undefined}
          className={id === current ? 'is-active' : undefined}
        >
          {t(label)}
        </a>
      ))}
    </nav>
  );
}
