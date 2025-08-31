import * as vscode from 'vscode';
import * as path from 'path';
import { ParserFactory } from '../testParser/parserFactory';
import { ApiService } from '../dataSync/apiService';
import { AuthService } from '../auth/authService';

export class TestWatcher {
    private watcher: vscode.FileSystemWatcher;
    private authService: AuthService;
    private apiService: ApiService;

    constructor(context: vscode.ExtensionContext, private workspaceFolder: string) {
        this.authService = AuthService.getInstance(context);
        this.apiService = new ApiService();

        this.watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(workspaceFolder, '**/test/**/*.{js,ts,java,py}')
        );

        this.setupWatchers();
    }

    private setupWatchers() {
        this.watcher.onDidChange(async (uri) => {
            await this.processTestFile(uri.fsPath);
        });

        this.watcher.onDidCreate(async (uri) => {
            await this.processTestFile(uri.fsPath);
        });
    }

    private async processTestFile(filePath: string) {
        if (!await this.authService.isLoggedIn()) {
            return;
        }

        const parser = ParserFactory.getParser(filePath);
        if (parser) {
            try {
                const results = await parser.parseTestFile(filePath);
                const token = await this.authService.gettoken();
                
                // Filter out results with status "skipped" to match the expected type
                const filteredResults = results.filter(r => r.status !== "skipped");
                // Map filteredResults to match the expected TestResult type (without "skipped" status)
                const mappedResults = filteredResults.map(({ status, ...rest }) => ({
                    status: status as "pass" | "fail" | "unknown",
                    ...rest
                }));
                if (token && mappedResults.length > 0) {
                    await this.apiService.sendTestResults(mappedResults, token);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Error parsing test file: ${error}`);
            }
        }
    }

    dispose() {
        this.watcher.dispose();
    }
}