import * as vscode from 'vscode';
import * as crypto from 'crypto';

export interface UserData {
    id: string;
    email: string;
    name: string;
    projects?: any[];
}

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
            // Validate inputs
            if (!email || !password) {
                throw new Error('Email and password are required');
            }

            // Get API URL from configuration
            const config = vscode.workspace.getConfiguration('testAutomationTracker');
            const apiUrl = config.get<string>('apiUrl') || 'http://localhost:5000/api/v1';

            // Your JavaScript web app API endpoint
            const response = await fetch(`${apiUrl}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user: {
                        email: email,
                        password: password
                    },
                    client: 'vscode-extension',
                    version: this.getExtensionVersion()
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const message = (typeof errorData === 'object' && errorData !== null && 'message' in errorData)
                    ? (errorData as { message?: string }).message
                    : undefined;
                throw new Error(message || `Login failed with status: ${response.status}`);
            }

            const data = await response.json() as { auth_token?: string; token?: string; user?: UserData };
            
            // Store authentication data
            await this.context.secrets.store('token', data.auth_token || data.token || '');
            await this.context.secrets.store('userData', JSON.stringify(data.user));
            await this.context.secrets.store('lastLogin', Date.now().toString());

            // Update global state
            await this.context.globalState.update('isLoggedIn', true);
            await this.context.globalState.update('userEmail', email);

            return true;
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }

    async isLoggedIn(): Promise<boolean> {
        try {
            const token = await this.context.secrets.get('token');
            if (!token) return false;

            // Check if token is expired (optional)
            const lastLogin = await this.context.secrets.get('lastLogin');
            if (lastLogin) {
                const loginTime = parseInt(lastLogin);
                const now = Date.now();
                // Token expires after 24 hours
                if (now - loginTime > 24 * 60 * 60 * 1000) {
                    await this.logout();
                    return false;
                }
            }

            return true;
        } catch (error) {
            console.error('Error checking login status:', error);
            return false;
        }
    }

    async logout(): Promise<void> {
        try {
            // Optional: Call logout API
            const token = await this.gettoken();
            if (token) {
                const config = vscode.workspace.getConfiguration('testAutomationTracker');
                const apiUrl = config.get<string>('apiUrl') || 'http://localhost:5000/api/v1';
                
                await fetch(`${apiUrl}/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }).catch(() => { /* Ignore errors on logout */ });
            }
        } catch (error) {
            // Ignore errors during logout
        } finally {
            // Clear stored data
            await this.context.secrets.delete('token');
            await this.context.secrets.delete('userData');
            await this.context.secrets.delete('lastLogin');
            await this.context.globalState.update('isLoggedIn', false);
            await this.context.globalState.update('userEmail', undefined);
        }
    }

    async gettoken(): Promise<string | undefined> {
        return this.context.secrets.get('token');
    }

    async getUserData(): Promise<UserData | null> {
        try {
            const userDataStr = await this.context.secrets.get('userData');
            if (!userDataStr) return null;
            
            return JSON.parse(userDataStr) as UserData;
        } catch (error) {
            console.error('Error getting user data:', error);
            return null;
        }
    }

    async getCurrentUserEmail(): Promise<string | undefined> {
        return this.context.globalState.get('userEmail');
    }

    private getExtensionVersion(): string {
        const extension = vscode.extensions.getExtension('caffetest.test-automation-tracker');
        return extension?.packageJSON.version || '1.0.0';
    }

    // Optional: Token refresh functionality
    async refreshToken(): Promise<boolean> {
        try {
            const token = await this.gettoken();
            if (!token) return false;

            const config = vscode.workspace.getConfiguration('testAutomationTracker');
            const apiUrl = config.get<string>('apiUrl') || 'http://localhost:5000/api/v1';

            const response = await fetch(`${apiUrl}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json() as { auth_token?: string; token?: string };
                await this.context.secrets.store('token', data.auth_token || data.token || '');
                await this.context.secrets.store('lastLogin', Date.now().toString());
                return true;
            }
        } catch (error) {
            console.error('Token refresh failed:', error);
        }
        return false;
    }
}