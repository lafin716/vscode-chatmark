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
exports.MemoView = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const memoStore_js_1 = require("./memoStore.js");
const CONFIG_SECTION = 'chatmark';
const CONFIG_KEY = 'memoDisplayMode';
const STATE_KEY = 'chatmark.memosVisible';
function readMode() {
    const value = vscode.workspace.getConfiguration(CONFIG_SECTION).get(CONFIG_KEY, 'toggle');
    return value === 'off' || value === 'always' || value === 'toggle' ? value : 'toggle';
}
function workspaceRootFor(uri) {
    return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
function formatCreatedAt(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) {
        return iso;
    }
    return d.toLocaleString();
}
function buildHover(memos) {
    const md = new vscode.MarkdownString();
    md.isTrusted = false;
    md.supportThemeIcons = true;
    md.appendMarkdown(`$(note) **Chatmark Memo${memos.length > 1 ? `s (${memos.length})` : ''}**\n\n`);
    memos.forEach((m, idx) => {
        if (idx > 0) {
            md.appendMarkdown('\n\n---\n\n');
        }
        md.appendMarkdown(`_${formatCreatedAt(m.createdAt)}_\n\n`);
        md.appendText(m.content);
    });
    return md;
}
class MemoView {
    context;
    decorationType;
    statusBarItem;
    codeLensEmitter = new vscode.EventEmitter();
    disposables = [];
    mode;
    constructor(context) {
        this.context = context;
        this.mode = readMode();
        const iconPath = vscode.Uri.file(path.join(context.extensionPath, 'media', 'memo.svg'));
        this.decorationType = vscode.window.createTextEditorDecorationType({
            gutterIconPath: iconPath,
            gutterIconSize: 'contain',
        });
        this.disposables.push(this.decorationType);
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.command = 'chatmark.toggleMemos';
        this.disposables.push(this.statusBarItem);
        const hoverProvider = vscode.languages.registerHoverProvider({ scheme: 'file' }, {
            provideHover: (doc, pos) => this.provideHover(doc, pos),
        });
        this.disposables.push(hoverProvider);
        const codeLensProvider = vscode.languages.registerCodeLensProvider({ scheme: 'file' }, {
            onDidChangeCodeLenses: this.codeLensEmitter.event,
            provideCodeLenses: (doc) => this.provideCodeLenses(doc),
        });
        this.disposables.push(codeLensProvider, this.codeLensEmitter);
        this.disposables.push(vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(`${CONFIG_SECTION}.${CONFIG_KEY}`)) {
                this.mode = readMode();
                this.syncStatusBar();
                this.refreshAll();
            }
        }), vscode.window.onDidChangeActiveTextEditor(editor => this.refresh(editor)), vscode.window.onDidChangeVisibleTextEditors(() => this.refreshAll()));
        this.syncStatusBar();
        this.refreshAll();
    }
    isCurrentlyVisible() {
        if (this.mode === 'off') {
            return false;
        }
        if (this.mode === 'always') {
            return true;
        }
        return this.context.workspaceState.get(STATE_KEY, true);
    }
    toggleVisibility() {
        if (this.mode !== 'toggle') {
            vscode.window.showInformationMessage(`Toggle is only available when memoDisplayMode is "toggle" (current: ${this.mode})`);
            return;
        }
        const next = !this.isCurrentlyVisible();
        this.context.workspaceState.update(STATE_KEY, next);
        this.syncStatusBar();
        this.refreshAll();
    }
    refresh(editor) {
        if (!editor) {
            return;
        }
        if (editor.document.uri.scheme !== 'file' || !this.isCurrentlyVisible()) {
            editor.setDecorations(this.decorationType, []);
            return;
        }
        const root = workspaceRootFor(editor.document.uri);
        if (!root) {
            editor.setDecorations(this.decorationType, []);
            return;
        }
        const entry = (0, memoStore_js_1.getFileEntry)(root, editor.document.uri.fsPath);
        if (!entry || entry.lineMemos.length === 0) {
            editor.setDecorations(this.decorationType, []);
            return;
        }
        const lineCount = editor.document.lineCount;
        const seenLines = new Set();
        const ranges = [];
        for (const memo of entry.lineMemos) {
            if (memo.line < 1 || memo.line > lineCount || seenLines.has(memo.line)) {
                continue;
            }
            seenLines.add(memo.line);
            const lineIdx = memo.line - 1;
            ranges.push(new vscode.Range(lineIdx, 0, lineIdx, 0));
        }
        editor.setDecorations(this.decorationType, ranges);
    }
    refreshAll() {
        for (const editor of vscode.window.visibleTextEditors) {
            this.refresh(editor);
        }
        this.codeLensEmitter.fire();
    }
    dispose() {
        for (const d of this.disposables) {
            d.dispose();
        }
    }
    syncStatusBar() {
        if (this.mode !== 'toggle') {
            this.statusBarItem.hide();
            return;
        }
        const visible = this.isCurrentlyVisible();
        this.statusBarItem.text = `$(note) Memos: ${visible ? 'ON' : 'OFF'}`;
        this.statusBarItem.tooltip = 'Click to toggle Chatmark memo display';
        this.statusBarItem.show();
    }
    provideHover(doc, pos) {
        if (!this.isCurrentlyVisible() || doc.uri.scheme !== 'file') {
            return null;
        }
        const root = workspaceRootFor(doc.uri);
        if (!root) {
            return null;
        }
        const entry = (0, memoStore_js_1.getFileEntry)(root, doc.uri.fsPath);
        if (!entry) {
            return null;
        }
        const line = pos.line + 1;
        const memos = entry.lineMemos.filter(m => m.line === line);
        if (memos.length === 0) {
            return null;
        }
        return new vscode.Hover(buildHover(memos), new vscode.Range(pos.line, 0, pos.line, doc.lineAt(pos.line).text.length));
    }
    provideCodeLenses(doc) {
        if (!this.isCurrentlyVisible() || doc.uri.scheme !== 'file') {
            return [];
        }
        const root = workspaceRootFor(doc.uri);
        if (!root) {
            return [];
        }
        const entry = (0, memoStore_js_1.getFileEntry)(root, doc.uri.fsPath);
        if (!entry || entry.lineMemos.length === 0) {
            return [];
        }
        const lineCount = doc.lineCount;
        const grouped = new Map();
        for (const memo of entry.lineMemos) {
            if (memo.line < 1 || memo.line > lineCount) {
                continue;
            }
            grouped.set(memo.line, (grouped.get(memo.line) ?? 0) + 1);
        }
        const lenses = [];
        for (const [line, count] of grouped) {
            const lineIdx = line - 1;
            const range = new vscode.Range(lineIdx, 0, lineIdx, 0);
            lenses.push(new vscode.CodeLens(range, {
                title: `$(note) 메모 ${count}개`,
                command: 'chatmark.showLineMemos',
                arguments: [doc.uri, line],
            }));
        }
        return lenses;
    }
}
exports.MemoView = MemoView;
