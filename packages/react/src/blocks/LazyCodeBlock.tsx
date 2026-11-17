import { lazyModule, useLazy } from '../ui/lazy';
import type { BlockViewProps } from '../ui/types';

const codeBlock = lazyModule(() => import('./CodeBlock').then((module) => module.CodeBlock), {
  soon: true,
});

/**
 * Блок кода из отдельного чанка. Пока чанк грузится (его запрос уходит сразу после монтирования редактора, к первому вводу он обычно готов),
 * на его месте текст кода как есть: документ с кодом открывается без пустого места. `CodeBlock` по-прежнему
 * экспортируется для своих реестров компонентов.
 */
export function LazyCodeBlock(props: BlockViewProps) {
  const CodeBlock = useLazy(codeBlock);

  return CodeBlock ? <CodeBlock {...props} /> : <CodeBlockPlaceholder {...props} />;
}

/** Место блока кода, пока грузится чанк: текст кода как есть, без правки. */
export function CodeBlockPlaceholder({ block }: BlockViewProps) {
  return (
    <div
      className="block block-code"
      data-inkbrick-block="code"
      data-block-id={block.id}
      data-loading=""
      contentEditable={false}
    >
      <pre>{block.content.map((node) => node.insert).join('')}</pre>
    </div>
  );
}
