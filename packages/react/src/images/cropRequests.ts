/**
 * Блоки, которые только что получили картинку из выбора (загрузка или ссылка): их редактор кадра открывается сам.
 * Запрос живёт, пока блок его не заберёт, поэтому порядок «картинка записана — блок перерисован» не важен.
 */
const requested = new Set<string>();

export const requestCrop = (blockId: string) => void requested.add(blockId);

/** Забирает запрос: `true` один раз для блока, на который он был поставлен. */
export const consumeCrop = (blockId: string): boolean => requested.delete(blockId);

export const dropCropRequest = (blockId: string) => void requested.delete(blockId);
