import type { Folder } from '../types';

/** Помощники для дерева папок: порядок, вложенность, проверка перемещений. */

export function childrenOf(folders: Folder[], parentId: string | null): Folder[] {
  return folders
    .filter((f) => (f.parentId ?? null) === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

export interface FolderNode {
  folder: Folder;
  depth: number;
  children: FolderNode[];
}

export function folderTree(folders: Folder[]): FolderNode[] {
  const build = (parentId: string | null, depth: number): FolderNode[] =>
    childrenOf(folders, parentId).map((folder) => ({
      folder,
      depth,
      children: build(folder.id, depth + 1),
    }));
  return build(null, 0);
}

/** Плоский список для выпадающих меню: [папка, отступ]. */
export function flatFolders(folders: Folder[]): { folder: Folder; depth: number }[] {
  const out: { folder: Folder; depth: number }[] = [];
  const walk = (nodes: FolderNode[]) => {
    for (const node of nodes) {
      out.push({ folder: node.folder, depth: node.depth });
      walk(node.children);
    }
  };
  walk(folderTree(folders));
  return out;
}

export function descendantIds(folders: Folder[], id: string): Set<string> {
  const result = new Set<string>();
  const walk = (parent: string) => {
    for (const f of folders) {
      if (f.parentId === parent && !result.has(f.id)) {
        result.add(f.id);
        walk(f.id);
      }
    }
  };
  walk(id);
  return result;
}

/** Нельзя переместить папку в себя или в своего потомка. */
export function canMoveFolder(folders: Folder[], id: string, targetId: string | null): boolean {
  if (id === targetId) return false;
  if (targetId === null) return true;
  return !descendantIds(folders, id).has(targetId);
}

export function folderPath(folders: Folder[], id: string | null): Folder[] {
  const path: Folder[] = [];
  let current = id;
  let guard = 0;
  while (current && guard++ < 40) {
    const folder = folders.find((f) => f.id === current);
    if (!folder) break;
    path.unshift(folder);
    current = folder.parentId;
  }
  return path;
}

export function folderName(folders: Folder[], id: string | null): string {
  if (!id) return 'Без папки';
  return folders.find((f) => f.id === id)?.name ?? 'Без папки';
}

/** Уникальное имя среди соседей: «Папка», «Папка 2», … */
export function uniqueFolderName(folders: Folder[], base: string, parentId: string | null): string {
  const siblings = new Set(
    folders.filter((f) => (f.parentId ?? null) === parentId).map((f) => f.name.trim().toLowerCase()),
  );
  const name = base.trim() || 'Папка';
  if (!siblings.has(name.toLowerCase())) return name;
  for (let i = 2; i < 100; i++) {
    const candidate = `${name} ${i}`;
    if (!siblings.has(candidate.toLowerCase())) return candidate;
  }
  return `${name} ${Date.now()}`;
}
