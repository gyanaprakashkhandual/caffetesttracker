import * as vscode from 'vscode';
import * as crypto from 'crypto';

export class AuthService {
    private static instance: AuthService;
    private context: vscode.ExtensionContext;

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    static getInstance(context: vscode.ExtensionContext): AuthService {
        if (!AuthService.instance) {
            AuthService.instance = new AuthService(context);
        }
        return AuthService.instance;
    }

    async login(email: string, password: string): Promise<boolean> {
        try {
            // Encrypt credentials before sending
            const encryptedData = this.encryptCredentials(email, password);
            
            // Your web app API endpoint
            const response = await fetch('https://your-webapp.com/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: encryptedData.email,
                    password: encryptedData.password,
                    extensionId: this.context.extension.id
                })
            });

            if (response.ok) {
                const data = await response.json() as { token: string };
                await this.context.secrets.store('authToken', data.token);
                await this.context.secrets.store('userEmail', email);
                return true;
            }
            return false;
        } catch (error) {
            vscode.window.showErrorMessage('Login failed: ' + error);
            return false;
        }
    }

    async isLoggedIn(): Promise<boolean> {
        const token = await this.context.secrets.get('authToken');
        return !!token;
    }

    async logout(): Promise<void> {
        await this.context.secrets.delete('authToken');
        await this.context.secrets.delete('userEmail');
    }

    async getAuthToken(): Promise<string | undefined> {
        return this.context.secrets.get('authToken');
    }

    private encryptCredentials(email: string, password: string): { email: string; password: string } {
        // Simple encryption - consider using more secure methods
        const cipher = (text: string) => Buffer.from(text).toString('base64');
        return {
            email: cipher(email),
            password: cipher(password)
        };
    }
}