import * as vscode from 'vscode';
import * as path from 'path';
import { addFileMemo, addLineMemo, getLineMemos } from './memoStore.js';
import { MemoView } from './memoView.js';

function resolveWorkspaceRoot(uri: vscode.Uri | undefined): vscode.WorkspaceFolder | undefined {
    if (uri) {
        const folder = vscode.workspace.getWorkspaceFolder(uri);
        if (folder) {
            return folder;
        }
    }
    return vscode.workspace.workspaceFolders?.[0];
}

export function activate(context: vscode.ExtensionContext) {
    const view = new MemoView(context);
    context.subscriptions.push(view);

    const addMemoCommand = vscode.commands.registerCommand('chatmark.addMemo', async (uri: vscode.Uri) => {
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
            addFileMemo(folder.uri.fsPath, uri.fsPath, memo);
            view.refreshAll();
            vscode.window.showInformationMessage('Memo saved successfully');
        } catch (error) {
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
            addLineMemo(folder.uri.fsPath, editor.document.uri.fsPath, line, memo);
            view.refreshAll();
            vscode.window.showInformationMessage(`Memo saved at ${fileName}:${line}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save memo: ${error}`);
        }
    });

    const toggleMemosCommand = vscode.commands.registerCommand('chatmark.toggleMemos', () => {
        view.toggleVisibility();
    });

    const showLineMemosCommand = vscode.commands.registerCommand('chatmark.showLineMemos', async (uri: vscode.Uri, line: number) => {
        if (!uri || typeof line !== 'number') {
            return;
        }
        const folder = resolveWorkspaceRoot(uri);
        if (!folder) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }
        const memos = getLineMemos(folder.uri.fsPath, uri.fsPath, line);
        if (memos.length === 0) {
            vscode.window.showInformationMessage(`No memos at ${path.basename(uri.fsPath)}:${line}`);
            return;
        }
        await vscode.window.showQuickPick(
            memos.map(m => ({
                label: new Date(m.createdAt).toLocaleString(),
                detail: m.content,
            })),
            { placeHolder: `Memos at ${path.basename(uri.fsPath)}:${line}`, matchOnDetail: true },
        );
    });

    const memoWatcher = vscode.workspace.createFileSystemWatcher('**/.memo/memo.json');
    memoWatcher.onDidChange(() => view.refreshAll());
    memoWatcher.onDidCreate(() => view.refreshAll());
    memoWatcher.onDidDelete(() => view.refreshAll());

    context.subscriptions.push(
        addMemoCommand,
        addLineMemoCommand,
        toggleMemosCommand,
        showLineMemosCommand,
        memoWatcher,
    );
}

export function deactivate() {}