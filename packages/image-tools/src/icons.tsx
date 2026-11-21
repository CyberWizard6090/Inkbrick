// Контуры иконок Lucide (https://lucide.dev, лицензия ISC — см. THIRD_PARTY_NOTICES.md).
type Shape = readonly [
  tag: 'path' | 'rect' | 'circle',
  attributes: Readonly<Record<string, string>>,
];

const SHAPES = {
  check: [['path', { d: 'M20 6 9 17l-5-5' }]],
  'chevron-down': [['path', { d: 'm6 9 6 6 6-6' }]],
  'arrow-left': [
    ['path', { d: 'm12 19-7-7 7-7' }],
    ['path', { d: 'M19 12H5' }],
  ],
  'arrow-right': [
    ['path', { d: 'M5 12h14' }],
    ['path', { d: 'm12 5 7 7-7 7' }],
  ],
  minus: [['path', { d: 'M5 12h14' }]],
  plus: [
    ['path', { d: 'M5 12h14' }],
    ['path', { d: 'M12 5v14' }],
  ],
  download: [
    ['path', { d: 'M12 15V3' }],
    ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }],
    ['path', { d: 'm7 10 5 5 5-5' }],
  ],
  minimize: [
    ['path', { d: 'm14 10 7-7' }],
    ['path', { d: 'M20 10h-6V4' }],
    ['path', { d: 'm3 21 7-7' }],
    ['path', { d: 'M4 14h6v6' }],
  ],
  portrait: [['rect', { width: '12', height: '20', x: '6', y: '2', rx: '2' }]],
  landscape: [['rect', { width: '20', height: '12', x: '2', y: '6', rx: '2' }]],
  square: [['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2' }]],
  circle: [['circle', { cx: '12', cy: '12', r: '10' }]],
  frame: [
    ['path', { d: 'M3 7V5a2 2 0 0 1 2-2h2' }],
    ['path', { d: 'M17 3h2a2 2 0 0 1 2 2v2' }],
    ['path', { d: 'M21 17v2a2 2 0 0 1-2 2h-2' }],
    ['path', { d: 'M7 21H5a2 2 0 0 1-2-2v-2' }],
  ],
} as const satisfies Record<string, readonly Shape[]>;

export type ToolIconName = keyof typeof SHAPES;

/** Иконка 24×24 цветом текста; размер задаёт CSS. */
export function ToolIcon({ name }: { readonly name: ToolIconName }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-inkbrick-icon={name}
    >
      {(SHAPES[name] as readonly Shape[]).map(([Tag, attributes], index) => (
        <Tag key={index} {...attributes} />
      ))}
    </svg>
  );
}
