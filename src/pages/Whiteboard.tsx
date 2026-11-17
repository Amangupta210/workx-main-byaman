import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import {
  ArrowDownRight, Check, Circle, Eraser, Menu, Minus, MousePointer2, Pencil, Plus,
  Redo2, RectangleHorizontal, RotateCcw, Shapes, Trash2, Triangle, Type, Undo2, Upload,
  X,
} from 'lucide-react';
import AppSidebar from '@/components/layout/AppSidebar';
import AIPanel from '@/components/ai/AIPanel';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { useUIStore } from '@/stores/uiStore';
import { loadWhiteboard, saveWhiteboard } from '@/lib/whiteboardDb';
import {
  clampBoardZoom,
  itemsEqual,
  makeBoardId,
  moveBoardItem,
  resizeBoardItem,
  scenePointFromViewport,
  type BoardItem,
  type BoardPoint,
  type BoardTool,
  type BoardViewport,
} from '@/lib/whiteboard';

const SCENE_WIDTH = 2400;
const SCENE_HEIGHT = 1500;
const DEFAULT_COLOR = 'hsl(var(--board-coral))';
const COLORS = [
  { name: 'Coral', value: 'hsl(var(--board-coral))', className: 'board-color-coral' },
  { name: 'Amber', value: 'hsl(var(--board-amber))', className: 'board-color-amber' },
  { name: 'Green', value: 'hsl(var(--board-green))', className: 'board-color-green' },
  { name: 'Blue', value: 'hsl(var(--board-blue))', className: 'board-color-blue' },
  { name: 'Violet', value: 'hsl(var(--board-violet))', className: 'board-color-violet' },
  { name: 'Ink', value: 'hsl(var(--foreground))', className: 'board-color-ink' },
];

const TOOLS: { id: BoardTool; label: string; icon: typeof MousePointer2 }[] = [
  { id: 'select', label: 'Select', icon: MousePointer2 },
  { id: 'draw', label: 'Draw', icon: Pencil },
  { id: 'rect', label: 'Rectangle', icon: RectangleHorizontal },
  { id: 'ellipse', label: 'Circle', icon: Circle },
  { id: 'triangle', label: 'Triangle', icon: Triangle },
  { id: 'line', label: 'Line', icon: Minus },
  { id: 'arrow', label: 'Arrow', icon: ArrowDownRight },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'erase', label: 'Eraser', icon: Eraser },
];

interface Gesture {
  pointerId: number;
  kind: 'draw' | 'shape' | 'move' | 'resize' | 'pan' | 'erase';
  itemId?: string;
  origin: BoardPoint;
  start: BoardPoint;
  screenStart: BoardPoint;
  baseItems: BoardItem[];
  historyItems: BoardItem[];
  baseViewport: BoardViewport;
  points: BoardPoint[];
}

interface PinchGesture {
  distance: number;
  zoom: number;
  x: number;
  y: number;
  center: BoardPoint;
}

function pointDistance(a: BoardPoint, b: BoardPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function getPointerItemId(target: EventTarget | null): string | undefined {
  return target instanceof Element ? target.closest('[data-board-item]')?.getAttribute('data-board-item') ?? undefined : undefined;
}

export default function WhiteboardRoute() {
  const isMobile = useIsMobile();
  const { setSidebarOpen, toggleSidebar } = useUIStore();
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile, setSidebarOpen]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <AppSidebar />
      <WhiteboardPage />
      <AIPanel />
    </div>
  );
}

function WhiteboardPage() {
  const { toggleSidebar } = useUIStore();
  const [boardItems, setBoardItemsState] = useState<BoardItem[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<BoardTool>('select');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [brushSize, setBrushSize] = useState(4);
  const [viewport, setViewport] = useState<BoardViewport>({ x: 0, y: 0, zoom: 1 });
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<BoardItem[]>([]);
  const boardReadyRef = useRef(false);
  const viewportRef = useRef(viewport);
  const gestureRef = useRef<Gesture | null>(null);
  const pointersRef = useRef<Map<number, BoardPoint>>(new Map());
  const pinchRef = useRef<PinchGesture | null>(null);
  const pastRef = useRef<BoardItem[][]>([]);
  const futureRef = useRef<BoardItem[][]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [now, setNow] = useState(() => new Date());

  const selected = useMemo(() => boardItems?.find((item) => item.id === selectedId) ?? null, [boardItems, selectedId]);
  const canUndo = historyVersion >= 0 && pastRef.current.length > 0;
  const canRedo = historyVersion >= 0 && futureRef.current.length > 0;

  useEffect(() => {
    let active = true;
    void loadWhiteboard().then((loaded) => {
      if (!active) return;
      itemsRef.current = loaded;
      boardReadyRef.current = true;
      setBoardItemsState(loaded);
    }).catch(() => {
      if (active) setLoadError(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (boardItems === null || loadError) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setIsSaving(true);
    saveTimeoutRef.current = setTimeout(() => {
      void saveWhiteboard(boardItems)
        .then(() => setIsSaving(false))
        .catch((error: unknown) => {
          setIsSaving(false);
          toast.error(error instanceof Error ? `Couldn't save this board: ${error.message}` : 'Couldn’t save this board. Check available storage.');
        });
    }, 350);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [boardItems, loadError]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const fit = () => {
      const width = shell.clientWidth;
      const height = shell.clientHeight;
      if (!width || !height) return;
      const zoom = clampBoardZoom(Math.min(width / SCENE_WIDTH, height / SCENE_HEIGHT, 1) * 0.88);
      setViewport({ x: (width - SCENE_WIDTH * zoom) / 2, y: (height - SCENE_HEIGHT * zoom) / 2, zoom });
    };
    const observer = new ResizeObserver(fit);
    observer.observe(shell);
    fit();
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
  }, []);

  const setItems = useCallback((next: BoardItem[]) => {
    itemsRef.current = next;
    if (boardReadyRef.current) setBoardItemsState(next);
  }, []);

  const commitSnapshot = useCallback((snapshot: BoardItem[]) => {
    if (!itemsEqual(snapshot, itemsRef.current)) {
      pastRef.current = [...pastRef.current.slice(-79), snapshot];
      futureRef.current = [];
      setHistoryVersion((value) => value + 1);
    }
  }, []);

  const addItem = useCallback((item: BoardItem) => {
    commitSnapshot(itemsRef.current);
    setItems([...itemsRef.current, item]);
    setSelectedId(item.id);
  }, [commitSnapshot, setItems]);

  const undo = useCallback(() => {
    const previous = pastRef.current.pop();
    if (!previous) return;
    futureRef.current = [...futureRef.current, itemsRef.current];
    setItems(previous);
    setSelectedId(null);
    setHistoryVersion((value) => value + 1);
  }, [setItems]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current = [...pastRef.current, itemsRef.current];
    setItems(next);
    setSelectedId(null);
    setHistoryVersion((value) => value + 1);
  }, [setItems]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const editing = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (editing) return;
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if ((event.metaKey || event.ctrlKey) && key === 'y') {
        event.preventDefault();
        redo();
      } else if (key === 'escape') {
        setSelectedId(null);
        setTool('select');
      } else if ((key === 'delete' || key === 'backspace') && selectedId) {
        event.preventDefault();
        const next = itemsRef.current.filter((item) => item.id !== selectedId);
        commitSnapshot(itemsRef.current);
        setItems(next);
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commitSnapshot, redo, selectedId, setItems, undo]);

  const fitCanvas = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const zoom = clampBoardZoom(Math.min(shell.clientWidth / SCENE_WIDTH, shell.clientHeight / SCENE_HEIGHT, 1) * 0.88);
    setViewport({ x: (shell.clientWidth - SCENE_WIDTH * zoom) / 2, y: (shell.clientHeight - SCENE_HEIGHT * zoom) / 2, zoom });
  }, []);

  const zoomAt = useCallback((requestedZoom: number, anchorX?: number, anchorY?: number) => {
    const shell = shellRef.current;
    if (!shell) return;
    const current = viewportRef.current;
    const zoom = clampBoardZoom(requestedZoom);
    const px = anchorX ?? shell.clientWidth / 2;
    const py = anchorY ?? shell.clientHeight / 2;
    const ratio = zoom / current.zoom;
    setViewport({ x: px - (px - current.x) * ratio, y: py - (py - current.y) * ratio, zoom });
  }, []);

  const onWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
    const next = clampBoardZoom(viewportRef.current.zoom * Math.exp(-delta * 0.0015));
    zoomAt(next, event.clientX - rect.left, event.clientY - rect.top);
  };

  const startGesture = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || !boardItems || loadError) return;
    event.preventDefault();
    const rect = svg.getBoundingClientRect();
    const screenPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const point = scenePointFromViewport(event.clientX, event.clientY, rect, viewportRef.current);
    const itemId = getPointerItemId(event.target);
    const baseItems = itemsRef.current;
    const item = itemId ? baseItems.find((entry) => entry.id === itemId) : undefined;
    let kind: Gesture['kind'];
    let origin = point;

    if (pointersRef.current.size > 0) {
      pointersRef.current.set(event.pointerId, screenPoint);
      const [first, second] = [...pointersRef.current.values()];
      const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      pinchRef.current = { distance: pointDistance(first, second), zoom: viewportRef.current.zoom, x: viewportRef.current.x, y: viewportRef.current.y, center };
      return;
    }

    pointersRef.current.set(event.pointerId, screenPoint);
    const isResize = event.target instanceof Element && event.target.closest('[data-board-resize]') !== null;

    if (tool === 'erase') {
      kind = 'erase';
      if (itemId) {
        commitSnapshot(baseItems);
        setItems(baseItems.filter((entry) => entry.id !== itemId));
      }
      setSelectedId(null);
    } else if (tool === 'select' && isResize && selectedId) {
      kind = 'resize';
      const selectedItem = baseItems.find((entry) => entry.id === selectedId);
      if (selectedItem) origin = { x: selectedItem.width, y: selectedItem.height };
    } else if (tool === 'select' && itemId) {
      kind = 'move';
      origin = item ? { x: point.x - item.x, y: point.y - item.y } : point;
      setSelectedId(itemId);
    } else if (tool === 'select') {
      kind = 'pan';
      setSelectedId(null);
    } else if (tool === 'draw' || ['rect', 'ellipse', 'triangle', 'line', 'arrow'].includes(tool)) {
      kind = tool === 'draw' ? 'draw' : 'shape';
      const newItem: BoardItem = {
        id: makeBoardId(), type: tool, x: point.x, y: point.y, width: 1, height: 1,
        color, strokeWidth: brushSize,
        ...(tool === 'draw' ? { points: [{ x: 0, y: 0 }] } : {}),
        ...(tool === 'line' || tool === 'arrow' ? { points: [{ x: 0, y: 0 }, { x: 0, y: 0 }] } : {}),
      };
      kind = tool === 'draw' ? 'draw' : 'shape';
      origin = newItem;
      const workingItems = [...baseItems, newItem];
      setItems(workingItems);
      setSelectedId(newItem.id);
      gestureRef.current = {
        pointerId: event.pointerId,
        kind,
        itemId: newItem.id,
        origin: point,
        start: point,
        screenStart: screenPoint,
        baseItems: workingItems,
        historyItems: baseItems,
        baseViewport: viewportRef.current,
        points: [{ x: 0, y: 0 }],
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    } else {
      const newItem: BoardItem = {
        id: makeBoardId(), type: 'text', x: point.x, y: point.y, width: 220, height: 64,
        color, strokeWidth: brushSize, text: '', fontSize: 28,
      };
      addItem(newItem);
      setTool('select');
      return;
    }

    gestureRef.current = {
      pointerId: event.pointerId, kind, itemId,
      origin: origin as BoardPoint,
      start: point, screenStart: screenPoint, baseItems, historyItems: baseItems,
      baseViewport: viewportRef.current, points: [],
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveGesture = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const screenPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (pointersRef.current.has(event.pointerId)) pointersRef.current.set(event.pointerId, screenPoint);

    const pinch = pinchRef.current;
    if (pinch && pointersRef.current.size >= 2) {
      const [first, second] = [...pointersRef.current.values()];
      const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const zoom = clampBoardZoom(pinch.zoom * (pointDistance(first, second) / Math.max(1, pinch.distance)));
      const ratio = zoom / pinch.zoom;
      setViewport({
        x: center.x - (pinch.center.x - pinch.x) * ratio,
        y: center.y - (pinch.center.y - pinch.y) * ratio,
        zoom,
      });
      return;
    }

    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      if (tool === 'erase' && pointersRef.current.has(event.pointerId)) {
        const itemId = getPointerItemId(event.target);
        if (itemId && itemsRef.current.some((item) => item.id === itemId)) {
          commitSnapshot(itemsRef.current);
          setItems(itemsRef.current.filter((item) => item.id !== itemId));
        }
      }
      return;
    }

    const point = scenePointFromViewport(event.clientX, event.clientY, rect, gesture.baseViewport);
    if (gesture.kind === 'pan') {
      setViewport({ ...gesture.baseViewport, x: gesture.baseViewport.x + screenPoint.x - gesture.screenStart.x, y: gesture.baseViewport.y + screenPoint.y - gesture.screenStart.y });
      return;
    }
    if (gesture.kind === 'erase') {
      const itemId = getPointerItemId(event.target);
      if (itemId && itemsRef.current.some((item) => item.id === itemId)) setItems(itemsRef.current.filter((item) => item.id !== itemId));
      return;
    }

    const current = gesture.baseItems.find((item) => item.id === gesture.itemId);
    if (!current) return;
    if (gesture.kind === 'move') {
      const nextX = point.x - gesture.origin.x;
      const nextY = point.y - gesture.origin.y;
      const dx = nextX - current.x;
      const dy = nextY - current.y;
      setItems(gesture.baseItems.map((item) => item.id === current.id ? moveBoardItem(item, dx, dy) : item));
    } else if (gesture.kind === 'resize') {
      setItems(gesture.baseItems.map((item) => item.id === current.id
        ? resizeBoardItem(item, gesture.origin.x + point.x - gesture.start.x, gesture.origin.y + point.y - gesture.start.y)
        : item));
    } else if (gesture.kind === 'draw') {
      const local = { x: point.x - current.x, y: point.y - current.y };
      gesture.points.push(local);
      setItems(gesture.baseItems.map((item) => item.id === current.id
        ? { ...item, points: [...gesture.points], width: Math.max(1, local.x), height: Math.max(1, local.y) }
        : item));
    } else if (gesture.kind === 'shape') {
      const dx = point.x - gesture.start.x;
      const dy = point.y - gesture.start.y;
      const x = dx < 0 ? gesture.start.x + dx : gesture.start.x;
      const y = dy < 0 ? gesture.start.y + dy : gesture.start.y;
      const width = Math.max(1, Math.abs(dx));
      const height = Math.max(1, Math.abs(dy));
      const flipX = dx < 0;
      const flipY = dy < 0;
      const points = current.type === 'line' || current.type === 'arrow'
        ? [{ x: flipX ? width : 0, y: flipY ? height : 0 }, { x: flipX ? 0 : width, y: flipY ? 0 : height }]
        : current.points;
      setItems(gesture.baseItems.map((item) => item.id === current.id
        ? { ...item, x, y, width, height, flipX, flipY, points }
        : item));
    }
  };

  const finishGesture = (event: ReactPointerEvent<SVGSVGElement>) => {
    const gesture = gestureRef.current;
    if (gesture?.pointerId === event.pointerId) {
      commitSnapshot(gesture.historyItems);
      gestureRef.current = null;
    }
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
  };

  const addImage = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file.');
      return;
    }
    try {
      const imageData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('The image could not be read.'));
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('The image could not be read.'));
        reader.readAsDataURL(file);
      });
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error('This image could not be opened.'));
        image.src = imageData;
      });
      const scale = Math.min(1, 520 / Math.max(dimensions.width, dimensions.height));
      addItem({
        id: makeBoardId(), type: 'image', x: (SCENE_WIDTH - dimensions.width * scale) / 2,
        y: (SCENE_HEIGHT - dimensions.height * scale) / 2,
        width: dimensions.width * scale, height: dimensions.height * scale,
        color, strokeWidth: brushSize, imageData,
      });
      setTool('select');
      toast.success('Image added to your board.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add this image.');
    }
  };

  const openImagePicker = () => fileRef.current?.click();

  const clearBoard = () => {
    if (itemsRef.current.length === 0 || !window.confirm('Clear everything from this board? This cannot be undone after you leave the page.')) return;
    commitSnapshot(itemsRef.current);
    setItems([]);
    setSelectedId(null);
    toast.success('Board cleared.');
  };

  const updateSelected = (patch: Partial<BoardItem>) => {
    if (!selected) return;
    commitSnapshot(itemsRef.current);
    setItems(itemsRef.current.map((item) => item.id === selected.id ? { ...item, ...patch } : item));
  };

  const replaceImage = async (file: File) => {
    if (!selected || selected.type !== 'image') return;
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file.');
      return;
    }
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('The image could not be read.'));
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('The image could not be read.'));
        reader.readAsDataURL(file);
      });
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error('This image could not be opened.'));
        image.src = data;
      });
      const scale = Math.min(1, selected.width / dimensions.width, selected.height / dimensions.height);
      updateSelected({ imageData: data, width: dimensions.width * scale, height: dimensions.height * scale });
      toast.success('Image replaced.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not replace this image.');
    }
  };

  const changeTool = (nextTool: BoardTool) => {
    setTool(nextTool);
    if (nextTool !== 'select') setSelectedId(null);
    if (nextTool === 'image') openImagePicker();
  };

  const label = isSaving ? 'Saving…' : 'Saved on this device';

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-3 py-2 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="Toggle navigation" title="Toggle navigation" onClick={toggleSidebar}><Menu className="h-4 w-4" /></Button>
          <Shapes className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">Whiteboard</h1>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><span className={`h-1.5 w-1.5 rounded-full ${loadError ? 'bg-destructive' : isSaving ? 'bg-primary' : 'bg-accent'}`} aria-hidden="true" />{loadError ? 'Couldn’t load saved work' : label}</p>
          </div>
        </div>
        <time className="ml-auto text-right text-xs text-muted-foreground" dateTime={now.toISOString()}>
          <span className="block font-medium text-foreground">{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          <span>{now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        </time>
      </header>

      {loadError && (
        <div role="alert" className="flex items-center justify-between gap-3 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <span>Your saved board could not be opened. New changes aren’t being saved.</span>
          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>Try again</Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-card px-2 py-2 sm:gap-2 sm:px-3">
        <div className="flex items-center gap-1 pr-1 sm:border-r sm:border-border sm:pr-2" role="group" aria-label="Whiteboard tools">
          {TOOLS.map(({ id, label: toolLabel, icon: Icon }) => (
            <Button key={id} size="icon" variant={tool === id ? 'secondary' : 'ghost'} onClick={() => changeTool(id)} aria-label={toolLabel} aria-pressed={tool === id} title={toolLabel} className="h-9 w-9 shrink-0">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </Button>
          ))}
          <Button size="icon" variant={tool === 'image' ? 'secondary' : 'ghost'} onClick={openImagePicker} aria-label="Add image" title="Add image" className="h-9 w-9 shrink-0">
            <Upload className="h-4 w-4" aria-hidden="true" />
          </Button>
          <input ref={fileRef} className="sr-only" type="file" accept="image/*" aria-label="Choose an image for the whiteboard" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void (selected?.type === 'image' ? replaceImage(file) : addImage(file));
            event.target.value = '';
          }} />
        </div>

        <div className="flex items-center gap-1 pr-1 sm:border-r sm:border-border sm:pr-2" role="group" aria-label="Edit history">
          <Button size="icon" variant="ghost" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo" className="h-9 w-9"><Undo2 className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo" className="h-9 w-9"><Redo2 className="h-4 w-4" /></Button>
        </div>

        <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Drawing color">
          {COLORS.map((option) => (
            <button key={option.name} type="button" role="radio" aria-label={`${option.name} color`} aria-checked={color === option.value} title={option.name} onClick={() => {
              setColor(option.value);
              if (selected) updateSelected({ color: option.value });
            }} className={`grid h-7 w-7 place-items-center rounded-full border border-border ${option.className} ${color === option.value ? 'ring-2 ring-ring ring-offset-2 ring-offset-background' : ''}`}>
              {color === option.value && <Check className="h-3.5 w-3.5 text-background" aria-hidden="true" />}
            </button>
          ))}
        </div>

        <div className="flex w-20 items-center gap-2 border-l border-border pl-2 sm:w-24 sm:pl-3" aria-label={`Brush size ${brushSize} pixels`}>
          <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Slider value={[brushSize]} min={2} max={24} step={1} onValueChange={(value) => setBrushSize(value[0] ?? 4)} aria-label="Brush size" />
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => zoomAt(viewport.zoom / 1.2)} aria-label="Zoom out" title="Zoom out" className="h-9 w-9"><Minus className="h-4 w-4" /></Button>
          <button type="button" className="min-w-12 px-1 text-xs tabular-nums text-muted-foreground hover:text-foreground" onClick={() => zoomAt(1)} aria-label="Reset zoom">{Math.round(viewport.zoom * 100)}%</button>
          <Button size="icon" variant="ghost" onClick={() => zoomAt(viewport.zoom * 1.2)} aria-label="Zoom in" title="Zoom in" className="h-9 w-9"><Plus className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" onClick={fitCanvas} aria-label="Fit canvas" title="Fit canvas" className="h-9 w-9"><RotateCcw className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" onClick={clearBoard} aria-label="Clear board" title="Clear board" className="h-9 w-9 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      {selected && (
        <section className="flex flex-wrap items-center gap-3 border-b border-border bg-background px-3 py-2" aria-label="Selected object settings">
          <span className="text-xs font-medium capitalize text-muted-foreground">{selected.type}</span>
          {selected.type === 'text' && (
            <>
              <textarea value={selected.text ?? ''} onChange={(event) => updateSelected({ text: event.target.value })} rows={1} placeholder="Write something…" aria-label="Edit text" className="min-w-36 flex-1 resize-y rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">Size <input aria-label="Text size" type="number" min={12} max={128} value={selected.fontSize ?? 28} onChange={(event) => updateSelected({ fontSize: Math.max(12, Math.min(128, Number(event.target.value) || 28)) })} className="w-16 rounded-md border border-input bg-background px-2 py-1 text-foreground" /></label>
            </>
          )}
          {selected.type === 'image' && <Button size="sm" variant="outline" onClick={openImagePicker}><Upload className="h-3.5 w-3.5" />Replace image</Button>}
          {selected.type !== 'text' && <label className="flex items-center gap-2 text-xs text-muted-foreground">Line width <input aria-label="Line width" type="number" min={1} max={32} value={selected.strokeWidth} onChange={(event) => updateSelected({ strokeWidth: Math.max(1, Math.min(32, Number(event.target.value) || 1)) })} className="w-16 rounded-md border border-input bg-background px-2 py-1 text-foreground" /></label>}
          <span className="text-[11px] text-muted-foreground">Drag the corner to resize</span>
          <Button size="icon" variant="ghost" className="ml-auto h-8 w-8" aria-label="Deselect" onClick={() => setSelectedId(null)}><X className="h-4 w-4" /></Button>
        </section>
      )}

      <div ref={shellRef} className="whiteboard-grid relative min-h-0 flex-1 overflow-hidden bg-background" data-testid="whiteboard-canvas">
        {boardItems === null ? (
          <div className="absolute inset-0 grid place-items-center"><div role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-r-transparent" />Opening your board…</div></div>
        ) : (
          <svg ref={svgRef} className={`absolute inset-0 h-full w-full touch-none select-none ${tool === 'draw' ? 'cursor-crosshair' : tool === 'erase' ? 'cursor-cell' : tool === 'select' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`} viewBox={`0 0 ${shellRef.current?.clientWidth || SCENE_WIDTH} ${shellRef.current?.clientHeight || SCENE_HEIGHT}`} preserveAspectRatio="none" onWheel={onWheel} onPointerDown={startGesture} onPointerMove={moveGesture} onPointerUp={finishGesture} onPointerCancel={finishGesture}>
            <defs>
              <marker id="whiteboard-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
                <path d="M0 0L10 5L0 10z" fill="context-stroke" />
              </marker>
              <filter id="whiteboard-image-shadow" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="hsl(var(--foreground))" floodOpacity="0.14" />
              </filter>
            </defs>
            <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
              <rect x={0} y={0} width={SCENE_WIDTH} height={SCENE_HEIGHT} fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth={1 / viewport.zoom} />
              {boardItems.map((item) => (
                <g key={item.id} data-board-item={item.id} data-board-type={item.type} className="board-object">
                  {item.type === 'draw' && <polyline points={(item.points ?? []).map((point) => `${item.x + point.x},${item.y + point.y}`).join(' ')} fill="none" stroke={item.color} strokeWidth={item.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />}
                  {item.type === 'rect' && <rect x={item.x} y={item.y} width={item.width} height={item.height} rx={4} fill="none" stroke={item.color} strokeWidth={item.strokeWidth} />}
                  {item.type === 'ellipse' && <ellipse cx={item.x + item.width / 2} cy={item.y + item.height / 2} rx={item.width / 2} ry={item.height / 2} fill="none" stroke={item.color} strokeWidth={item.strokeWidth} />}
                  {item.type === 'triangle' && <polygon points={`${item.x + item.width / 2},${item.y} ${item.x + item.width},${item.y + item.height} ${item.x},${item.y + item.height}`} fill="none" stroke={item.color} strokeWidth={item.strokeWidth} strokeLinejoin="round" />}
                  {(item.type === 'line' || item.type === 'arrow') && <line x1={item.x + (item.points?.[0]?.x ?? 0)} y1={item.y + (item.points?.[0]?.y ?? 0)} x2={item.x + (item.points?.[1]?.x ?? item.width)} y2={item.y + (item.points?.[1]?.y ?? item.height)} stroke={item.color} strokeWidth={item.strokeWidth} strokeLinecap="round" markerEnd={item.type === 'arrow' ? 'url(#whiteboard-arrow)' : undefined} />}
                  {item.type === 'text' && <text x={item.x} y={item.y + (item.fontSize ?? 28)} fill={item.color} fontFamily="system-ui, sans-serif" fontSize={item.fontSize ?? 28} dominantBaseline="alphabetic">{item.text || 'Text'}</text>}
                  {item.type === 'image' && item.imageData && <image href={item.imageData} x={item.x} y={item.y} width={item.width} height={item.height} preserveAspectRatio="xMidYMid meet" filter="url(#whiteboard-image-shadow)" />}
                  <rect x={item.x} y={item.y} width={Math.max(item.width, 16)} height={Math.max(item.height, 16)} fill="transparent" stroke="transparent" strokeWidth={12} pointerEvents="all" />
                  {selectedId === item.id && tool === 'select' && (
                    <g aria-hidden="true">
                      <rect x={item.x - 5} y={item.y - 5} width={item.width + 10} height={item.height + 10} fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} strokeDasharray="5 4" pointerEvents="none" />
                      <rect data-board-resize="true" x={item.x + item.width - 7} y={item.y + item.height - 7} width={14} height={14} rx={2} fill="hsl(var(--primary))" stroke="hsl(var(--card))" strokeWidth={2} style={{ cursor: 'nwse-resize', touchAction: 'none' }} />
                    </g>
                  )}
                </g>
              ))}
            </g>
          </svg>
        )}
        {boardItems?.length === 0 && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-border bg-card/95 px-3 py-2 text-center text-xs text-muted-foreground shadow-sm">
            Choose a tool, then sketch out your ideas.
          </div>
        )}
      </div>
    </main>
  );
}