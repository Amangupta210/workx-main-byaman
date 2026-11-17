import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import {
  clampBoardZoom,
  moveBoardItem,
  resizeBoardItem,
  scenePointFromViewport,
  type BoardItem,
} from './whiteboard';
import { clearWhiteboard, loadWhiteboard, saveWhiteboard } from './whiteboardDb';

const sample: BoardItem = {
  id: 'shape-1', type: 'rect', x: 40, y: 30, width: 80, height: 60,
  color: 'hsl(var(--primary))', strokeWidth: 3,
};

describe('whiteboard tools and saved work', () => {
  beforeEach(async () => {
    await clearWhiteboard();
  });

  it('saves and restores the board after reopening the document', async () => {
    const board = [sample, { ...sample, id: 'label-1', type: 'text' as const, text: 'Sprint plan' }];
    await saveWhiteboard(board);
    expect(await loadWhiteboard()).toEqual(board);
  });

  it('restores an empty canvas after clearing saved work', async () => {
    await saveWhiteboard([sample]);
    await clearWhiteboard();
    expect(await loadWhiteboard()).toEqual([]);
  });

  it('keeps zoom between 20% and 300%', () => {
    expect(clampBoardZoom(0.1)).toBe(0.2);
    expect(clampBoardZoom(1.5)).toBe(1.5);
    expect(clampBoardZoom(4)).toBe(3);
  });

  it('maps the pointer into canvas coordinates at the current zoom', () => {
    expect(scenePointFromViewport(270, 190, { left: 20, top: 30 }, { x: 50, y: 40, zoom: 2 }))
      .toEqual({ x: 100, y: 60 });
  });

  it('moves freehand points with their stroke', () => {
    const moved = moveBoardItem({ ...sample, type: 'draw', points: [{ x: 40, y: 30 }, { x: 60, y: 55 }] }, 12, -8);
    expect(moved).toMatchObject({ x: 52, y: 22, points: [{ x: 40, y: 30 }, { x: 60, y: 55 }] });
  });

  it('keeps images proportional when resized and enforces a usable minimum', () => {
    const image: BoardItem = { ...sample, type: 'image', width: 200, height: 100 };
    expect(resizeBoardItem(image, 400, 300)).toMatchObject({ width: 400, height: 200 });
    expect(resizeBoardItem(sample, 2, 10)).toMatchObject({ width: 24, height: 24 });
  });
});