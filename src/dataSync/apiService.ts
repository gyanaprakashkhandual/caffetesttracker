export interface TestResult {
    testName: string;
    status: 'pass' | 'fail' | 'unknown';
    filePath: string;
    framework: string;
    timestamp: Date;
    expectedResult?: string;
    actualResult?: string;
    errorMessage?: string;
}

export class ApiService {
    private baseUrl = 'https://your-webapp.com/api';

    async sendTestResults(results: TestResult[], authToken: string): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/test-results`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    results,
                    timestamp: new Date().toISOString()
                })
            });

            return response.ok;
        } catch (error) {
            console.error('Failed to send test results:', error);
            return false;
        }
    }

    async validateConnection(authToken: string): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/validate`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }
}