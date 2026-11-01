/**
 * Служебные данные блока: когда и кем создан/изменён. Заполняются хранилищем, если включена опция `meta`
 * (`new Editor({ meta: { user: () => 'alice' } })`); без неё поле отсутствует.
 */
export interface BlockMeta {
  createdAt: number;
  createdBy?: string;
  updatedAt: number;
  updatedBy?: string;
}
