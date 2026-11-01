import { test, expect } from '@playwright/test';

import { useSystemClipboard } from './sandbox';

const editable = '.editable';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const undoKey = `${modifier}+Z`;
const redoKey = `${modifier}+Shift+Z`;

test.describe('Undo / redo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator(editable).first().click();
  });

  test('quick typing is one step; undo/redo restore text and caret', async ({ page }) => {
    await page.keyboard.type('hello world');
    await expect(page.locator(editable).first()).toHaveText('hello world');

    await page.keyboard.press(undoKey);
    await expect(page.locator(editable).first()).toHaveText('');

    await page.keyboard.press(redoKey);
    await expect(page.locator(editable).first()).toHaveText('hello world');

    await page.keyboard.type('!');
    await expect(page.locator(editable).first()).toHaveText('hello world!');
  });

  test('Ctrl+Y also redoes', async ({ page }) => {
    await page.keyboard.type('abc');
    await page.keyboard.press(undoKey);
    await page.keyboard.press(`${modifier}+Y`);

    await expect(page.locator(editable).first()).toHaveText('abc');
  });

  test('moving the caret starts a new step', async ({ page }) => {
    await page.keyboard.type('abc');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.type('X');
    await expect(page.locator(editable).first()).toHaveText('abXc');

    await page.keyboard.press(undoKey);
    await expect(page.locator(editable).first()).toHaveText('abc');
    await page.keyboard.press(undoKey);
    await expect(page.locator(editable).first()).toHaveText('');
  });

  test('undo of Enter merges the blocks back and puts the caret at the split', async ({ page }) => {
    await page.keyboard.type('abcd');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    await expect(page.locator(editable)).toHaveCount(2);

    await page.keyboard.press(undoKey);
    await expect(page.locator(editable)).toHaveCount(1);
    await expect(page.locator(editable).first()).toHaveText('abcd');

    await page.keyboard.type('|');
    await expect(page.locator(editable).first()).toHaveText('ab|cd');
  });

  test('undo of Backspace-merge restores both blocks', async ({ page }) => {
    await page.keyboard.type('one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('two');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Backspace');
    await expect(page.locator(editable)).toHaveCount(1);
    await expect(page.locator(editable).first()).toHaveText('onetwo');

    await page.keyboard.press(undoKey);
    await expect(page.locator(editable)).toHaveCount(2);
    await expect(page.locator(editable).nth(0)).toHaveText('one');
    await expect(page.locator(editable).nth(1)).toHaveText('two');
  });

  test('undo of a markdown shortcut brings the paragraph back', async ({ page }) => {
    await page.keyboard.type('#');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight'); // граница шага
    await page.keyboard.type(' ');
    await expect(page.locator('.block-heading')).toHaveCount(1);

    await page.keyboard.press(undoKey);
    await expect(page.locator('.block-heading')).toHaveCount(0);
    await expect(page.locator(editable).first()).toHaveText('#');
  });

  test('multi-line paste is a single undo step', async ({ page, context }) => {
    await useSystemClipboard(context);
    await page.evaluate(() => navigator.clipboard.writeText('one\ntwo\nthree'));

    await page.keyboard.press(`${modifier}+V`);
    await expect(page.locator(editable)).toHaveCount(3);

    await page.keyboard.press(undoKey);
    await expect(page.locator(editable)).toHaveCount(1);
    await expect(page.locator(editable).first()).toHaveText('');
  });

  test('a new edit after undo drops the redo history', async ({ page }) => {
    await page.keyboard.type('a');
    await page.keyboard.press(undoKey);
    await page.keyboard.type('b');
    await page.keyboard.press(redoKey);

    await expect(page.locator(editable).first()).toHaveText('b');
  });

  test('toolbar buttons reflect and drive the history', async ({ page }) => {
    const undo = page.getByTestId('undo');
    const redo = page.getByTestId('redo');

    await expect(undo).toBeDisabled();
    await expect(redo).toBeDisabled();

    await page.keyboard.type('abc');
    await expect(undo).toBeEnabled();

    await undo.click();
    await expect(page.locator(editable).first()).toHaveText('');
    await expect(undo).toBeDisabled();
    await expect(redo).toBeEnabled();

    await redo.click();
    await expect(page.locator(editable).first()).toHaveText('abc');
    await expect(redo).toBeDisabled();
  });
});
