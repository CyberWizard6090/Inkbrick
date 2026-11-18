import * as z from '../zod';

import { BLOCK_BACKGROUNDS, HEX_COLOR } from '../../utils/colors';

/**
 * Фон блока: имя из палитры (`BLOCK_BACKGROUNDS`, оттенок задаёт тема) или свой цвет `#rrggbb` из выбора «Свой цвет…».
 * Всё остальное (`url(…)`, `red; x`, `#fff`) схема отвергает, поэтому в `style` блока ничего небезопасного не попадает.
 */
export const blockBackgroundSchema = z.union([
  z.enum(BLOCK_BACKGROUNDS),
  z.string().regex(HEX_COLOR),
]);
