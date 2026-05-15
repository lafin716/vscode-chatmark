"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadStore = loadStore;
exports.getFileEntry = getFileEntry;
exports.getLineMemos = getLineMemos;
exports.saveStore = saveStore;
exports.addFileMemo = addFileMemo;
exports.addLineMemo = addLineMemo;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const MEMO_DIR_NAME = '.memo';
const MEMO_FILE_NAME = 'memo.json';
const STORE_VERSION = 1;
function memoDir(workspaceRoot) {
    return path.join(workspaceRoot, MEMO_DIR_NAME);
}
function memoFilePath(workspaceRoot) {
    return path.join(memoDir(workspaceRoot), MEMO_FILE_NAME);
}
function emptyStore() {
    return { version: STORE_VERSION, files: {} };
}
function toRelPosix(workspaceRoot, absFilePath) {
    const rel = path.relative(workspaceRoot, absFilePath);
    return rel.split(path.sep).join('/');
}
function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function ensureFileEntry(store, relPath) {
    let entry = store.files[relPath];
    if (!entry) {
        entry = { fileMemos: [], lineMemos: [] };
        store.files[relPath] = entry;
    }
    return entry;
}
function loadStore(workspaceRoot) {
    const filePath = memoFilePath(workspaceRoot);
    if (!fs.existsSync(filePath)) {
        return emptyStore();
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
        version: parsed.version ?? STORE_VERSION,
        files: parsed.files ?? {},
    };
}
function loadStoreSafe(workspaceRoot) {
    try {
        return loadStore(workspaceRoot);
    }
    catch (error) {
        console.error('[chatmark] failed to load memo store:', error);
        return emptyStore();
    }
}
function getFileEntry(workspaceRoot, absFilePath) {
    const store = loadStoreSafe(workspaceRoot);
    return store.files[toRelPosix(workspaceRoot, absFilePath)];
}
function getLineMemos(workspaceRoot, absFilePath, line) {
    const entry = getFileEntry(workspaceRoot, absFilePath);
    if (!entry) {
        return [];
    }
    return entry.lineMemos.filter(m => m.line === line);
}
function saveStore(workspaceRoot, store) {
    const dir = memoDir(workspaceRoot);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(memoFilePath(workspaceRoot), JSON.stringify(store, null, 2), 'utf-8');
}
function addFileMemo(workspaceRoot, absFilePath, content) {
    const store = loadStore(workspaceRoot);
    const entry = ensureFileEntry(store, toRelPosix(workspaceRoot, absFilePath));
    const memo = {
        id: newId(),
        content,
        createdAt: new Date().toISOString(),
    };
    entry.fileMemos.push(memo);
    saveStore(workspaceRoot, store);
    return memo;
}
function addLineMemo(workspaceRoot, absFilePath, line, content) {
    const store = loadStore(workspaceRoot);
    const entry = ensureFileEntry(store, toRelPosix(workspaceRoot, absFilePath));
    const memo = {
        id: newId(),
        line,
        content,
        createdAt: new Date().toISOString(),
    };
    entry.lineMemos.push(memo);
    saveStore(workspaceRoot, store);
    return memo;
}
