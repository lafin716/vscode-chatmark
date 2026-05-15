import * as fs from 'fs';
import * as path from 'path';

export interface FileMemo {
    id: string;
    content: string;
    createdAt: string;
}

export interface LineMemo {
    id: string;
    line: number;
    content: string;
    createdAt: string;
}

export interface FileEntry {
    fileMemos: FileMemo[];
    lineMemos: LineMemo[];
}

export interface MemoFile {
    version: number;
    files: Record<string, FileEntry>;
}

const MEMO_DIR_NAME = '.memo';
const MEMO_FILE_NAME = 'memo.json';
const STORE_VERSION = 1;

function memoDir(workspaceRoot: string): string {
    return path.join(workspaceRoot, MEMO_DIR_NAME);
}

function memoFilePath(workspaceRoot: string): string {
    return path.join(memoDir(workspaceRoot), MEMO_FILE_NAME);
}

function emptyStore(): MemoFile {
    return { version: STORE_VERSION, files: {} };
}

function toRelPosix(workspaceRoot: string, absFilePath: string): string {
    const rel = path.relative(workspaceRoot, absFilePath);
    return rel.split(path.sep).join('/');
}

function newId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function ensureFileEntry(store: MemoFile, relPath: string): FileEntry {
    let entry = store.files[relPath];
    if (!entry) {
        entry = { fileMemos: [], lineMemos: [] };
        store.files[relPath] = entry;
    }
    return entry;
}

export function loadStore(workspaceRoot: string): MemoFile {
    const filePath = memoFilePath(workspaceRoot);
    if (!fs.existsSync(filePath)) {
        return emptyStore();
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<MemoFile>;
    return {
        version: parsed.version ?? STORE_VERSION,
        files: parsed.files ?? {},
    };
}

function loadStoreSafe(workspaceRoot: string): MemoFile {
    try {
        return loadStore(workspaceRoot);
    } catch (error) {
        console.error('[chatmark] failed to load memo store:', error);
        return emptyStore();
    }
}

export function getFileEntry(workspaceRoot: string, absFilePath: string): FileEntry | undefined {
    const store = loadStoreSafe(workspaceRoot);
    return store.files[toRelPosix(workspaceRoot, absFilePath)];
}

export function getLineMemos(workspaceRoot: string, absFilePath: string, line: number): LineMemo[] {
    const entry = getFileEntry(workspaceRoot, absFilePath);
    if (!entry) {
        return [];
    }
    return entry.lineMemos.filter(m => m.line === line);
}

export function saveStore(workspaceRoot: string, store: MemoFile): void {
    const dir = memoDir(workspaceRoot);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(memoFilePath(workspaceRoot), JSON.stringify(store, null, 2), 'utf-8');
}

export function addFileMemo(workspaceRoot: string, absFilePath: string, content: string): FileMemo {
    const store = loadStore(workspaceRoot);
    const entry = ensureFileEntry(store, toRelPosix(workspaceRoot, absFilePath));
    const memo: FileMemo = {
        id: newId(),
        content,
        createdAt: new Date().toISOString(),
    };
    entry.fileMemos.push(memo);
    saveStore(workspaceRoot, store);
    return memo;
}

export function addLineMemo(workspaceRoot: string, absFilePath: string, line: number, content: string): LineMemo {
    const store = loadStore(workspaceRoot);
    const entry = ensureFileEntry(store, toRelPosix(workspaceRoot, absFilePath));
    const memo: LineMemo = {
        id: newId(),
        line,
        content,
        createdAt: new Date().toISOString(),
    };
    entry.lineMemos.push(memo);
    saveStore(workspaceRoot, store);
    return memo;
}
