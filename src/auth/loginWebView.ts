import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AuthService } from './authService';

export class LoginWebview {
    public static currentPanel: LoginWebview | undefined;
    private static readonly viewType = 'testAutomationTrackerLogin';
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(context: vscode.ExtensionContext) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (LoginWebview.currentPanel) {
            LoginWebview.currentPanel._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            LoginWebview.viewType,
            'Test Automation Tracker - Login',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'media')
                ],
                retainContextWhenHidden: true
            }
        );

        LoginWebview.currentPanel = new LoginWebview(panel, context);
    }

    public static revive(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
        LoginWebview.currentPanel = new LoginWebview(panel, context);
    }

    private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
        this._panel = panel;
        this._extensionUri = context.extensionUri;

        // Set the webview's initial HTML content
        this._update();

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'login':
                        await this.handleLogin(message.email, message.password, context);
                        return;
                    case 'closeWebview':
                        this.dispose();
                        return;
                    case 'forgotPassword':
                        this.handleForgotPassword();
                        return;
                    case 'showError':
                        vscode.window.showErrorMessage(message.text);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    private async handleLogin(email: string, password: string, context: vscode.ExtensionContext) {
        try {
            // Validate inputs
            if (!email || !password) {
                this._panel.webview.postMessage({ 
                    command: 'loginFailure', 
                    text: 'Please enter both email and password' 
                });
                return;
            }

            if (!this.isValidEmail(email)) {
                this._panel.webview.postMessage({ 
                    command: 'loginFailure', 
                    text: 'Please enter a valid email address' 
                });
                return;
            }

            const authService = AuthService.getInstance(context);
            const success = await authService.login(email, password);
            
            if (success) {
                this._panel.webview.postMessage({ 
                    command: 'loginSuccess', 
                    text: 'Login successful! Connecting to your web application...' 
                });

                // Close the webview after a short delay
                setTimeout(() => {
                    this.dispose();
                    vscode.window.showInformationMessage('Successfully connected to Test Automation Tracker');
                }, 1500);
            } else {
                this._panel.webview.postMessage({ 
                    command: 'loginFailure', 
                    text: 'Login failed. Please check your credentials and try again.' 
                });
            }
        } catch (error) {
            this._panel.webview.postMessage({ 
                command: 'loginFailure', 
                text: `Login error: ${error instanceof Error ? error.message : 'Unknown error'}` 
            });
        }
    }

    private handleForgotPassword() {
        vscode.env.openExternal(vscode.Uri.parse('https://your-webapp.com/forgot-password'));
    }

    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    public dispose() {
        LoginWebview.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Get the path to the HTML file
        const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'login.html');
        
        try {
            // Read HTML file
            let htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf8');
            
            // Replace local resource references with webview URIs
            htmlContent = htmlContent.replace(
                /(<link.*?href="|<\/script>)/g, 
                (match) => {
                    return match;
                }
            );

            return htmlContent;
        } catch (error) {
            return this._getFallbackHtml(webview);
        }
    }

    private _getFallbackHtml(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Test Automation Tracker - Login</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    margin: 0;
                    padding: 20px;
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                }
                .login-container {
                    max-width: 400px;
                    margin: 0 auto;
                    padding: 20px;
                }
                h1 {
                    text-align: center;
                    margin-bottom: 30px;
                    color: var(--vscode-editor-foreground);
                }
                .form-group {
                    margin-bottom: 20px;
                }
                label {
                    display: block;
                    margin-bottom: 5px;
                    font-weight: bold;
                }
                input {
                    width: 100%;
                    padding: 8px;
                    box-sizing: border-box;
                    background-color: var(--vscode-input-background);
                    border: 1px solid var(--vscode-input-border);
                    color: var(--vscode-input-foreground);
                }
                input:focus {
                    outline: none;
                    border-color: var(--vscode-focusBorder);
                }
                button {
                    width: 100%;
                    padding: 10px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    cursor: pointer;
                    font-weight: bold;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                button:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                .error-message {
                    color: var(--vscode-errorForeground);
                    margin-top: 10px;
                    display: none;
                }
                .success-message {
                    color: #13a10e;
                    margin-top: 10px;
                    display: none;
                }
                .footer {
                    margin-top: 20px;
                    text-align: center;
                    font-size: 12px;
                }
                .loader {
                    border: 3px solid #f3f3f3;
                    border-top: 3px solid var(--vscode-button-background);
                    border-radius: 50%;
                    width: 20px;
                    height: 20px;
                    animation: spin 1s linear infinite;
                    margin: 0 auto;
                    display: none;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .forgot-password {
                    text-align: right;
                    margin-top: 10px;
                }
                .forgot-password a {
                    color: var(--vscode-textLink-foreground);
                    text-decoration: none;
                    font-size: 12px;
                    cursor: pointer;
                }
                .forgot-password a:hover {
                    text-decoration: underline;
                }
            </style>
        </head>
        <body>
            <div class="login-container">
                <h1>Test Automation Tracker</h1>
                <p>Connect to your web application to track test results</p>
                
                <form id="login-form">
                    <div class="form-group">
                        <label for="email">Email Address</label>
                        <input type="email" id="email" name="email" required autocomplete="email">
                    </div>
                    
                    <div class="form-group">
                        <label for="password">Password</label>
                        <input type="password" id="password" name="password" required autocomplete="current-password">
                    </div>
                    
                    <div class="form-group">
                        <button type="submit" id="login-button">Login</button>
                        <div class="loader" id="loader"></div>
                    </div>
                    
                    <div class="forgot-password">
                        <a id="forgot-password-link">Forgot your password?</a>
                    </div>
                    
                    <div class="error-message" id="error-message"></div>
                    <div class="success-message" id="success-message"></div>
                </form>
                
                <div class="footer">
                    <p>Your credentials are sent securely to your web application</p>
                </div>
            </div>

            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    
                    // Form submission handler
                    document.getElementById('login-form').addEventListener('submit', (e) => {
                        e.preventDefault();
                        
                        const email = document.getElementById('email').value;
                        const password = document.getElementById('password').value;
                        
                        // Show loading state
                        document.getElementById('login-button').disabled = true;
                        document.getElementById('loader').style.display = 'block';
                        document.getElementById('error-message').style.display = 'none';
                        document.getElementById('success-message').style.display = 'none';
                        
                        // Send login data to extension
                        vscode.postMessage({
                            command: 'login',
                            email: email,
                            password: password
                        });
                    });
                    
                    // Forgot password handler
                    document.getElementById('forgot-password-link').addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'forgotPassword'
                        });
                    });
                    
                    // Handle messages from extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        
                        switch (message.command) {
                            case 'loginSuccess':
                                document.getElementById('loader').style.display = 'none';
                                document.getElementById('success-message').textContent = message.text;
                                document.getElementById('success-message').style.display = 'block';
                                break;
                                
                            case 'loginFailure':
                                document.getElementById('login-button').disabled = false;
                                document.getElementById('loader').style.display = 'none';
                                document.getElementById('error-message').textContent = message.text;
                                document.getElementById('error-message').style.display = 'block';
                                break;
                        }
                    });
                    
                    // Focus on email field when loaded
                    document.getElementById('email').focus();
                })();
            </script>
        </body>
        </html>`;
    }
}