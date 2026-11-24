import { useRef } from 'react';

/**
 * Затемнение за листом: касание по нему закрывает меню и не доходит до документа под ним. У вложенного листа своё
 * затемнение поверх родительского листа: касание «мимо» закрывает только вложенную панель и не задевает пункты
 * родителя, которые иначе оставались бы видны и нажимались.
 */
export function SheetBackdrop({ onClose, nested }: { onClose: () => void; nested?: boolean }) {
  // Закрывает только касание, которое началось на затемнении. Касание, открывшее меню (хваталка, долгое нажатие),
  // заканчивается click в той же точке, а там уже затемнение: без этой проверки меню закрывалось сразу после открытия.
  const pressed = useRef(false);

  return (
    <div
      data-inkbrick-ui="context-menu"
      data-inkbrick-block-ui
      data-inkbrick-part="sheet-backdrop"
      data-nested={nested || undefined}
      aria-hidden="true"
      onPointerDown={() => {
        pressed.current = true;
      }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        const own = pressed.current;

        pressed.current = false;
        // Вложенное затемнение лежит в портале, но по дереву React это потомок пункта: его клик не должен открыть панель снова.
        event.stopPropagation();
        if (own) onClose();
      }}
    />
  );
}
