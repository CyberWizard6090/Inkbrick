import { act, fireEvent, waitFor } from '@testing-library/react';

/**
 * Открывает «Свой цвет…» внутри `scope`, ждёт выбор цвета (его чанк грузится лениво), вводит `hex` (с прозрачностью —
 * восемь цифр) и нажимает «Применить».
 */
export async function pickCustomColor(scope: Element, hex: string): Promise<void> {
  const swatch = scope.querySelector<HTMLElement>('[data-color="custom"]')!;

  act(() => void fireEvent.click(swatch));

  const part = (name: string) => scope.querySelector<HTMLElement>(`[data-inkbrick-part="${name}"]`);

  await waitFor(() => {
    if (!part('color-field')) throw new Error('the colour picker is not open yet');
  });

  const field = part('color-field') as HTMLInputElement;

  act(() => {
    field.value = hex;
    fireEvent.change(field);
    fireEvent.click(part('color-apply')!);
  });
}
