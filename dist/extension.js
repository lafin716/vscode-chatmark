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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const memoStore_js_1 = require("./memoStore.js");
const memoView_js_1 = require("./memoView.js");
function resolveWorkspaceRoot(uri) {
    if (uri) {
        const folder = vscode.workspace.getWorkspaceFolder(uri);
        if (folder) {
            return folder;
        }
    }
    return vscode.workspace.workspaceFolders?.[0];
}
function activate(context) {
    const view = new memoView_js_1.MemoView(context);
    context.subscriptions.push(view);
    const addMemoCommand = vscode.commands.registerCommand('chatmark.addMemo', async (uri) => {
        if (!uri) {
            vscode.window.showErrorMessage('No file selected');
            return;
        }
        const memo = await vscode.window.showInputBox({
            prompt: `Add memo for: ${path.basename(uri.fsPath)}`,
            placeHolder: 'Enter your memo...',
        });
        if (memo === undefined) {
            return;
        }
        const folder = resolveWorkspaceRoot(uri);
        if (!folder) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }
        try {
            (0, memoStore_js_1.addFileMemo)(folder.uri.fsPath, uri.fsPath, memo);
            view.refreshAll();
            vscode.window.showInformationMessage('Memo saved successfully');
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to save memo: ${error}`);
        }
    });
    const addLineMemoCommand = vscode.commands.registerCommand('chatmark.addLineMemo', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }
        if (editor.document.uri.scheme !== 'file') {
            vscode.window.showErrorMessage('Line memos are only supported on saved files');
            return;
        }
        const line = editor.selection.active.line + 1;
        const fileName = path.basename(editor.document.uri.fsPath);
        const memo = await vscode.window.showInputBox({
            prompt: `Add memo for ${fileName}:${line}`,
            placeHolder: 'Enter your memo...',
        });
        if (memo === undefined) {
            return;
        }
        const folder = resolveWorkspaceRoot(editor.document.uri);
        if (!folder) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }
        try {
            (0, memoStore_js_1.addLineMemo)(folder.uri.fsPath, editor.document.uri.fsPath, line, memo);
            view.refreshAll();
            vscode.window.showInformationMessage(`Memo saved at ${fileName}:${line}`);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to save memo: ${error}`);
        }
    });
    const toggleMemosCommand = vscode.commands.registerCommand('chatmark.toggleMemos', () => {
        view.toggleVisibility();
    });
    const showLineMemosCommand = vscode.commands.registerCommand('chatmark.showLineMemos', async (uri, line) => {
        if (!uri || typeof line !== 'number') {
            return;
        }
        const folder = resolveWorkspaceRoot(uri);
        if (!folder) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }
        const memos = (0, memoStore_js_1.getLineMemos)(folder.uri.fsPath, uri.fsPath, line);
        if (memos.length === 0) {
            vscode.window.showInformationMessage(`No memos at ${path.basename(uri.fsPath)}:${line}`);
            return;
        }
        await vscode.window.showQuickPick(memos.map(m => ({
            label: new Date(m.createdAt).toLocaleString(),
            detail: m.content,
        })), { placeHolder: `Memos at ${path.basename(uri.fsPath)}:${line}`, matchOnDetail: true });
    });
    const memoWatcher = vscode.workspace.createFileSystemWatcher('**/.memo/memo.json');
    memoWatcher.onDidChange(() => view.refreshAll());
    memoWatcher.onDidCreate(() => view.refreshAll());
    memoWatcher.onDidDelete(() => view.refreshAll());
    context.subscriptions.push(addMemoCommand, addLineMemoCommand, toggleMemosCommand, showLineMemosCommand, memoWatcher);
}
function deactivate() { }
