export type BoardTool = 'select' | 'draw' | 'erase' | 'rect' | 'ellipse' | 'triangle' | 'line' | 'arrow' | 'text' | 'image';
export type BoardItemType = Exclude<BoardTool, 'select' | 'erase' | 'image'> | 'image';

export interface BoardPoint {
  x: number;
  y: number;
}

export interface BoardItem {
  id: string;
  type: BoardItemType;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  strokeWidth: number;
  flipX?: boolean;
  flipY?: boolean;
  points?: BoardPoint[];
  text?: string;
  fontSize?: number;
  imageData?: string;
}

export interface BoardViewport {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_BOARD_ITEM_SIZE = 24;
export const MIN_BOARD_ZOOM = 0.2;
export const MAX_BOARD_ZOOM = 3;

export function makeBoardId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function clampBoardZoom(zoom: number): number {
  return Math.min(MAX_BOARD_ZOOM, Math.max(MIN_BOARD_ZOOM, zoom));
}

export function scenePointFromViewport(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, 'left' | 'top'>,
  viewport: BoardViewport,
): BoardPoint {
  return {
    x: (clientX - rect.left - viewport.x) / viewport.zoom,
    y: (clientY - rect.top - viewport.y) / viewport.zoom,
  };
}

export function resizeBoardItem(item: BoardItem, width: number, height: number): BoardItem {
  const nextWidth = Math.max(MIN_BOARD_ITEM_SIZE, width);
  const nextHeight = Math.max(MIN_BOARD_ITEM_SIZE, height);
  if (item.type !== 'image' || item.width <= 0 || item.height <= 0) {
    return { ...item, width: nextWidth, height: nextHeight };
  }
  const aspect = item.width / item.height;
  const adjustedHeight = Math.max(MIN_BOARD_ITEM_SIZE, Math.min(nextHeight, nextWidth / aspect));
  const adjustedWidth = adjustedHeight * aspect;
  return { ...item, width: adjustedWidth, height: adjustedHeight };
}

export function moveBoardItem(item: BoardItem, dx: number, dy: number): BoardItem {
  return {
    ...item,
    x: item.x + dx,
    y: item.y + dy,
  };
}

export function itemsEqual(a: BoardItem[], b: BoardItem[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}