export type BlockType = 'text' | 'heading1' | 'heading2' | 'heading3' | 'todo' | 'image' | 'video' | 'audio' | 'code' | 'divider' | 'table';

export interface TableData {
  headers: string[];
  rows: string[][];
}

export interface Block {
  id: string;
  type: BlockType;
  content: string;
  checked?: boolean;
  mediaUrl?: string;
  language?: string;
  tableData?: TableData;
  createdAt: number;
}

export interface Page {
  id: string;
  title: string;
  icon?: string;
  coverImage?: string;
  parentId?: string | null;
  blocks: Block[];
  createdAt: number;
  updatedAt: number;
}

export function createBlock(type: BlockType = 'text', content = ''): Block {
  return {
    id: crypto.randomUUID(),
    type,
    content,
    checked: type === 'todo' ? false : undefined,
    tableData: type === 'table' ? { headers: ['Column 1', 'Column 2', 'Column 3'], rows: [['', '', ''], ['', '', '']] } : undefined,
    createdAt: Date.now(),
  };
}

export function createPage(title = 'Untitled', parentId?: string | null): Page {
  return {
    id: crypto.randomUUID(),
    title,
    icon: '📄',
    parentId: parentId ?? null,
    blocks: [createBlock('text')],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
