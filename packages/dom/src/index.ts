/**
 * `@inkbrick/dom`: части интерфейса Inkbrick на чистом DOM — без фреймворка внутри, поэтому они работают в React, Vue,
 * Svelte и без них, а также без самого редактора. Каждая часть доступна и отдельным входом, чтобы в бандл попадало только
 * нужное: `@inkbrick/dom/color-picker`, `@inkbrick/dom/image-tools`.
 */
export * from './color-picker';
export * from './image-tools';
