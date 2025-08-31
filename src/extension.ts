import * as vscode from 'vscode';
import { AuthService } from './auth/authService';
import { LoginWebview } from './auth/loginWebView';
import { TestWatcher } from './fileWatcher/testWatcher';

export function activate(context: vscode.ExtensionContext) {
    const authService = AuthService.getInstance(context);
    
    // Register commands
    const loginCommand = vscode.commands.registerCommand('testAutomationTracker.login', async () => {
        LoginWebview.createOrShow(context);
    });

    const logoutCommand = vscode.commands.registerCommand('testAutomationTracker.logout', async () => {
        const choice = await vscode.window.showWarningMessage(
            'Are you sure you want to logout?',
            'Yes', 'No'
        );
        
        if (choice === 'Yes') {
            await authService.logout();
            vscode.window.showInformationMessage('Logged out successfully');
        }
    });

    const statusCommand = vscode.commands.registerCommand('testAutomationTracker.status', async () => {
        const isLoggedIn = await authService.isLoggedIn();
        if (isLoggedIn) {
            const userEmail = await authService.getCurrentUserEmail();
            vscode.window.showInformationMessage(
                `Connected to Test Automation Tracker as ${userEmail || 'user'}`
            );
        } else {
            const choice = await vscode.window.showInformationMessage(
                'Please login to Test Automation Tracker',
                'Login'
            );
            if (choice === 'Login') {
                LoginWebview.createOrShow(context);
            }
        }
    });

    // Initialize file watchers for each workspace folder
    const watchers: TestWatcher[] = [];
    
    if (vscode.workspace.workspaceFolders) {
        vscode.workspace.workspaceFolders.forEach(folder => {
            watchers.push(new TestWatcher(context, folder.uri.fsPath));
        });
    }

    context.subscriptions.push(
        loginCommand,
        logoutCommand,
        statusCommand,
        ...watchers
    );

    // Check authentication status on startup
    authService.isLoggedIn().then(async (loggedIn) => {
        if (!loggedIn) {
            // Show notification after a short delay
            setTimeout(() => {
                vscode.window.showInformationMessage(
                    'Please login to Test Automation Tracker to start tracking your test results',
                    'Login'
                ).then(selection => {
                    if (selection === 'Login') {
                        LoginWebview.createOrShow(context);
                    }
                });
            }, 2000);
        } else {
            // Refresh token on startup if needed
            authService.refreshToken().catch(() => {
                // Silent fail - user can still use extension
            });
        }
    });

    // Register webview serializer for persistence
    if (vscode.window.registerWebviewPanelSerializer) {
        // Use the static viewType property or fallback to a string if not defined
        const viewType = (LoginWebview as any).viewType || 'testAutomationTracker.loginWebview';
        vscode.window.registerWebviewPanelSerializer(viewType, {
            async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
                LoginWebview.revive(webviewPanel, context);
            }
        });
    }
}

export function deactivate() {
    // Clean up resources
}