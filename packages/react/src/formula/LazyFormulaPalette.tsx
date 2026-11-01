import { useEffect, useState, type ComponentType } from 'react';

import type { FormulaPaletteProps } from './FormulaPalette';

type Palette = ComponentType<FormulaPaletteProps>;

let loaded: Palette | undefined;
let loading: Promise<Palette> | undefined;

/**
 * Загружает палитру заранее. Палитра (около 300 символов и шаблонов) не нужна для первой отрисовки, но должна
 * быть готова к первому редактору формулы: иначе Tab из поля кода, нажатый до её появления, уводит фокус из редактора.
 */
export function preloadFormulaPalette(): Promise<Palette> {
  return (loading ??= import('./FormulaPalette').then(
    (module) => (loaded = module.FormulaPalette),
  ));
}

/**
 * Палитра, загружаемая по требованию. Без React.lazy: Suspense придерживает показ загруженного содержимого
 * (~300 мс), а палитра должна появиться сразу, как только модуль готов.
 */
export function LazyFormulaPalette(props: FormulaPaletteProps) {
  const [Palette, setPalette] = useState<Palette | undefined>(() => loaded);

  useEffect(() => {
    if (Palette) return;

    let active = true;

    void preloadFormulaPalette().then((component) => {
      if (active) setPalette(() => component);
    });

    return () => {
      active = false;
    };
  }, [Palette]);

  return Palette ? <Palette {...props} /> : null;
}
