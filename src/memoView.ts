import * as vscode from 'vscode';
import * as path from 'path';
import { getFileEntry, LineMemo } from './memoStore.js';

type DisplayMode = 'off' | 'always' | 'toggle';

const CONFIG_SECTION = 'chatmark';
const CONFIG_KEY = 'memoDisplayMode';
const STATE_KEY = 'chatmark.memosVisible';

function readMode(): DisplayMode {
    const value = vscode.workspace.getConfiguration(CONFIG_SECTION).get<DisplayMode>(CONFIG_KEY, 'toggle');
    return value === 'off' || value === 'always' || value === 'toggle' ? value : 'toggle';
}

function workspaceRootFor(uri: vscode.Uri): string | undefined {
    return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function formatCreatedAt(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) {
        return iso;
    }
    return d.toLocaleString();
}

function buildHover(memos: LineMemo[]): vscode.MarkdownString {
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

export class MemoView implements vscode.Disposable {
    private readonly context: vscode.ExtensionContext;
    private readonly decorationType: vscode.TextEditorDecorationType;
    private readonly statusBarItem: vscode.StatusBarItem;
    private readonly codeLensEmitter = new vscode.EventEmitter<void>();
    private readonly disposables: vscode.Disposable[] = [];
    private mode: DisplayMode;

    constructor(context: vscode.ExtensionContext) {
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

        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration(`${CONFIG_SECTION}.${CONFIG_KEY}`)) {
                    this.mode = readMode();
                    this.syncStatusBar();
                    this.refreshAll();
                }
            }),
            vscode.window.onDidChangeActiveTextEditor(editor => this.refresh(editor)),
            vscode.window.onDidChangeVisibleTextEditors(() => this.refreshAll()),
        );

        this.syncStatusBar();
        this.refreshAll();
    }

    isCurrentlyVisible(): boolean {
        if (this.mode === 'off') {
            return false;
        }
        if (this.mode === 'always') {
            return true;
        }
        return this.context.workspaceState.get<boolean>(STATE_KEY, true);
    }

    toggleVisibility(): void {
        if (this.mode !== 'toggle') {
            vscode.window.showInformationMessage(`Toggle is only available when memoDisplayMode is "toggle" (current: ${this.mode})`);
            return;
        }
        const next = !this.isCurrentlyVisible();
        this.context.workspaceState.update(STATE_KEY, next);
        this.syncStatusBar();
        this.refreshAll();
    }

    refresh(editor: vscode.TextEditor | undefined): void {
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

        const entry = getFileEntry(root, editor.document.uri.fsPath);
        if (!entry || entry.lineMemos.length === 0) {
            editor.setDecorations(this.decorationType, []);
            return;
        }

        const lineCount = editor.document.lineCount;
        const seenLines = new Set<number>();
        const ranges: vscode.Range[] = [];
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

    refreshAll(): void {
        for (const editor of vscode.window.visibleTextEditors) {
            this.refresh(editor);
        }
        this.codeLensEmitter.fire();
    }

    dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
    }

    private syncStatusBar(): void {
        if (this.mode !== 'toggle') {
            this.statusBarItem.hide();
            return;
        }
        const visible = this.isCurrentlyVisible();
        this.statusBarItem.text = `$(note) Memos: ${visible ? 'ON' : 'OFF'}`;
        this.statusBarItem.tooltip = 'Click to toggle Chatmark memo display';
        this.statusBarItem.show();
    }

    private provideHover(doc: vscode.TextDocument, pos: vscode.Position): vscode.Hover | null {
        if (!this.isCurrentlyVisible() || doc.uri.scheme !== 'file') {
            return null;
        }
        const root = workspaceRootFor(doc.uri);
        if (!root) {
            return null;
        }
        const entry = getFileEntry(root, doc.uri.fsPath);
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

    private provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
        if (!this.isCurrentlyVisible() || doc.uri.scheme !== 'file') {
            return [];
        }
        const root = workspaceRootFor(doc.uri);
        if (!root) {
            return [];
        }
        const entry = getFileEntry(root, doc.uri.fsPath);
        if (!entry || entry.lineMemos.length === 0) {
            return [];
        }

        const lineCount = doc.lineCount;
        const grouped = new Map<number, number>();
        for (const memo of entry.lineMemos) {
            if (memo.line < 1 || memo.line > lineCount) {
                continue;
            }
            grouped.set(memo.line, (grouped.get(memo.line) ?? 0) + 1);
        }

        const lenses: vscode.CodeLens[] = [];
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
