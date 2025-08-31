import * as fs from 'fs';
import * as path from 'path';
import { ITestParser, TestResult, ParserConfig } from './interface';

export class PlaywrightParser implements ITestParser {
    private config: ParserConfig;

    constructor(config?: Partial<ParserConfig>) {
        this.config = {
            includePassed: true,
            includeSkipped: true,
            captureScreenshots: false,
            maxErrorLength: 1000,
            ...config
        };
    }

    supportsFile(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();
        const fileName = path.basename(filePath).toLowerCase();
        
        return (
            ext === '.js' || ext === '.ts' || ext === '.spec.js' || ext === '.spec.ts' ||
            fileName.includes('playwright') ||
            fileName.includes('test') ||
            fileName.includes('spec')
        );
    }

    async parseTestFile(filePath: string): Promise<TestResult[]> {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const content = fs.readFileSync(filePath, 'utf8');
        const results: TestResult[] = [];
        
        // Parse test definitions
        this.parseTestDefinitions(content, filePath, results);
        
        return results;
    }

    async parseTestOutput(output: string, filePath: string): Promise<TestResult[]> {
        const results: TestResult[] = [];
        
        // Parse JSON reporter output
        if (output.trim().startsWith('{') || output.trim().startsWith('[')) {
            try {
                const jsonData = JSON.parse(output);
                return this.parseJsonOutput(jsonData, filePath);
            } catch (e) {
                // If JSON parsing fails, fall back to text parsing
            }
        }
        
        // Parse text output
        this.parseTextOutput(output, filePath, results);
        
        return results;
    }

    private parseTestDefinitions(content: string, filePath: string, results: TestResult[]): void {
        const testPatterns = [
            // Playwright test patterns
            /test\.(?:\w+)\(['"](.*?)['"](?:.*?)(?:async\s*)?\(\)\s*=>\s*{/gs,
            /test\(['"](.*?)['"](?:.*?)(?:async\s*)?\(\)\s*=>\s*{/gs,
            /it\(['"](.*?)['"](?:.*?)(?:async\s*)?\(\)\s*=>\s*{/gs,
            /describe\(['"](.*?)['"](?:.*?)(?:async\s*)?\(\)\s*=>\s*{/gs,
        ];

        const suitePattern = /describe\(['"](.*?)['"]/g;

        // Extract suite names
        const suites: string[] = [];
        let suiteMatch;
        while ((suiteMatch = suitePattern.exec(content)) !== null) {
            suites.push(suiteMatch[1]);
        }

        for (const pattern of testPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const testName = match[1].trim();
                if (testName) {
                    results.push({
                        testName,
                        status: 'unknown',
                        filePath,
                        framework: 'playwright',
                        timestamp: new Date(),
                        suiteName: suites.length > 0 ? suites[suites.length - 1] : undefined,
                        tags: this.extractTags(content, match.index),
                        testId: this.generateTestId(testName, filePath)
                    });
                }
            }
        }
    }

    private parseJsonOutput(jsonData: any, filePath: string): TestResult[] {
        const results: TestResult[] = [];

        if (Array.isArray(jsonData)) {
            // Handle array of test results
            jsonData.forEach((test: any) => {
                results.push(this.jsonToTestResult(test, filePath));
            });
        } else if (jsonData.suites || jsonData.specs) {
            // Handle Playwright JSON reporter format
            this.parsePlaywrightJson(jsonData, filePath, results);
        } else if (jsonData.status) {
            // Single test result
            results.push(this.jsonToTestResult(jsonData, filePath));
        }

        return results;
    }

    private parsePlaywrightJson(jsonData: any, filePath: string, results: TestResult[]): void {
        const processSuite = (suite: any) => {
            if (suite.specs) {
                suite.specs.forEach((spec: any) => {
                    spec.tests.forEach((test: any) => {
                        results.push({
                            testName: spec.title,
                            status: this.mapPlaywrightStatus(test.status),
                            filePath: filePath,
                            framework: 'playwright',
                            timestamp: new Date(test.startTime || Date.now()),
                            duration: test.duration,
                            errorMessage: test.error?.message || undefined,
                            stackTrace: test.error?.stack || undefined,
                            suiteName: suite.title,
                            browser: test.projectName || undefined,
                            testId: spec.id
                        });
                    });
                });
            }

            if (suite.suites) {
                suite.suites.forEach(processSuite);
            }
        };

        if (jsonData.suites) {
            jsonData.suites.forEach(processSuite);
        }
    }

    private parseTextOutput(output: string, filePath: string, results: TestResult[]): void {
        const lines = output.split('\n');
        let currentTest: Partial<TestResult> | null = null;
        let errorLines: string[] = [];

        const testStartPattern = /✓ (.*?) \(.*?\)/;
        const testFailPattern = /✖ (.*?) \(.*?\)/;
        const testSkipPattern = /- (.*?) \(.*?\)/;
        const errorPattern = /Error:|\tat |\s+at /;
        const durationPattern = /\((\d+(?:\.\d+)?(?:ms|s|m))\)/;

        for (const line of lines) {
            if (testStartPattern.test(line)) {
                this.finalizeTest(currentTest, errorLines, results);
                const match = line.match(testStartPattern);
                currentTest = this.createTestResult(match![1], 'pass', filePath);
                this.extractDuration(line, currentTest);
            } else if (testFailPattern.test(line)) {
                this.finalizeTest(currentTest, errorLines, results);
                const match = line.match(testFailPattern);
                currentTest = this.createTestResult(match![1], 'fail', filePath);
                this.extractDuration(line, currentTest);
            } else if (testSkipPattern.test(line)) {
                this.finalizeTest(currentTest, errorLines, results);
                const match = line.match(testSkipPattern);
                currentTest = this.createTestResult(match![1], 'skipped', filePath);
                this.extractDuration(line, currentTest);
            } else if (currentTest && errorPattern.test(line)) {
                errorLines.push(line);
            }
        }

        this.finalizeTest(currentTest, errorLines, results);
    }

    private createTestResult(testName: string, status: TestResult['status'], filePath: string): Partial<TestResult> {
        return {
            testName: testName.trim(),
            status,
            filePath,
            framework: 'playwright',
            timestamp: new Date()
        };
    }

    private finalizeTest(test: Partial<TestResult> | null, errorLines: string[], results: TestResult[]): void {
        if (test && test.testName) {
            if (errorLines.length > 0 && test.status === 'fail') {
                test.errorMessage = errorLines.join('\n').substring(0, this.config.maxErrorLength);
            }
            
            results.push(test as TestResult);
        }
        errorLines = [];
    }

    private extractDuration(line: string, test: Partial<TestResult>): void {
        const durationMatch = line.match(/\((\d+(?:\.\d+)?)(ms|s|m)\)/);
        if (durationMatch) {
            let duration = parseFloat(durationMatch[1]);
            const unit = durationMatch[2];
            
            if (unit === 's') {duration *= 1000;}
            if (unit === 'm') {duration *= 60000;}
            
            test.duration = Math.round(duration);
        }
    }

    private extractTags(content: string, position: number): string[] {
        const tags: string[] = [];
        const lines = content.substring(0, position).split('\n');
        const lastLine = lines[lines.length - 1];
        
        // Look for @tags in comments above the test
        for (let i = lines.length - 2; i >= Math.max(0, lines.length - 10); i--) {
            const tagMatch = lines[i].match(/@(\w+)/g);
            if (tagMatch) {
                tags.push(...tagMatch.map(tag => tag.substring(1)));
            }
        }
        
        return tags;
    }

    private generateTestId(testName: string, filePath: string): string {
        return Buffer.from(`${filePath}:${testName}`).toString('base64');
    }

    private mapPlaywrightStatus(status: string): TestResult['status'] {
        switch (status) {
            case 'passed': return 'pass';
            case 'failed': return 'fail';
            case 'skipped': return 'skipped';
            case 'timedOut': return 'fail';
            case 'interrupted': return 'skipped';
            default: return 'unknown';
        }
    }

    private jsonToTestResult(testData: any, filePath: string): TestResult {
        return {
            testName: testData.title || testData.name || 'Unknown Test',
            status: this.mapPlaywrightStatus(testData.status || testData.state),
            filePath: filePath,
            framework: 'playwright',
            timestamp: new Date(testData.startTime || testData.timestamp || Date.now()),
            duration: testData.duration,
            errorMessage: testData.error?.message || testData.err?.message || undefined,
            stackTrace: testData.error?.stack || testData.err?.stack || undefined,
            expectedResult: testData.expected,
            actualResult: testData.actual,
            suiteName: testData.suite || testData.parent,
            browser: testData.browser || testData.projectName,
            testId: testData.id || testData.testId
        };
    }
}