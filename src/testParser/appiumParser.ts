import * as fs from 'fs';
import * as path from 'path';
import { ITestParser, TestResult, ParserConfig } from './interface';

export class AppiumParser implements ITestParser {
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
        const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
        
        return (
            ext === '.js' || ext === '.ts' || 
            fileName.includes('appium') ||
            fileName.includes('mobile') ||
            fileName.includes('test') ||
            content.includes('appium') ||
            content.includes('wd') ||
            content.includes('webdriver') ||
            content.includes('mobile') ||
            content.includes('device')
        );
    }

    async parseTestFile(filePath: string): Promise<TestResult[]> {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const content = fs.readFileSync(filePath, 'utf8');
        const results: TestResult[] = [];
        
        this.parseTestDefinitions(content, filePath, results);
        
        return results;
    }

    async parseTestOutput(output: string, filePath: string): Promise<TestResult[]> {
        const results: TestResult[] = [];
        
        // Appium tests often use Mocha, Jest, or other frameworks
        // Try to detect the framework and parse accordingly
        
        if (output.includes('mocha') || output.includes('describe') || output.includes('it(')) {
            this.parseMochaOutput(output, filePath, results);
        } else if (output.includes('jest') || output.includes('test(')) {
            this.parseJestOutput(output, filePath, results);
        } else {
            this.parseGenericOutput(output, filePath, results);
        }
        
        return results;
    }

    private parseTestDefinitions(content: string, filePath: string, results: TestResult[]): void {
        // Appium tests typically use Mocha, Jest, or other testing frameworks
        const patterns = [
            // Mocha patterns
            /it\(['"](.*?)['"](?:.*?)(?:async\s*)?\(\)\s*=>\s*{/gs,
            /describe\(['"](.*?)['"](?:.*?)(?:async\s*)?\(\)\s*=>\s*{/gs,
            
            // Jest patterns
            /test\(['"](.*?)['"](?:.*?)(?:async\s*)?\(\)\s*=>\s*{/gs,
            /it\(['"](.*?)['"](?:.*?)(?:async\s*)?\(\)\s*=>\s*{/gs,
            
            // Appium specific patterns
            /driver\.(?:get|findElement|click|sendKeys)/g
        ];

        const devicePattern = /deviceName\s*[:=]\s*['"](.*?)['"]/;
        const platformPattern = /platformName\s*[:=]\s*['"](.*?)['"]/;
        const appPattern = /app\s*[:=]\s*['"](.*?)['"]/;

        const deviceMatch = content.match(devicePattern);
        const platformMatch = content.match(platformPattern);
        const appMatch = content.match(appPattern);

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                if (match[1]) { // If it's a test definition with a name
                    results.push({
                        testName: match[1].trim(),
                        status: 'unknown',
                        filePath,
                        framework: 'appium',
                        timestamp: new Date(),
                        device: deviceMatch ? deviceMatch[1] : undefined,
                        os: platformMatch ? platformMatch[1] : undefined,
                        tags: this.extractAppiumTags(content),
                        testId: this.generateTestId(match[1], filePath)
                    });
                }
            }
        }

        // If no test definitions found but Appium commands are present
        if (results.length === 0 && patterns[4].test(content)) {
            results.push({
                testName: path.basename(filePath, path.extname(filePath)),
                status: 'unknown',
                filePath,
                framework: 'appium',
                timestamp: new Date(),
                device: deviceMatch ? deviceMatch[1] : undefined,
                os: platformMatch ? platformMatch[1] : undefined,
                tags: ['appium', 'mobile-test']
            });
        }
    }

    private parseMochaOutput(output: string, filePath: string, results: TestResult[]): void {
        const lines = output.split('\n');
        let currentSuite = '';
        let currentTest: Partial<TestResult> | null = null;

        for (const line of lines) {
            // Suite start
            if (line.includes('describe(') || line.match(/^\s*[✔✓]\s*[A-Z]/)) {
                const suiteMatch = line.match(/describe\(['"](.*?)['"]/) || line.match(/[✔✓]\s*(.*?)$/);
                if (suiteMatch) {currentSuite = suiteMatch[1];}
            }
            
            // Test pass
            else if (line.match(/[✔✓]\s*(.*?)$/)) {
                const match = line.match(/[✔✓]\s*(.*?)$/);
                if (match) {
                    results.push({
                        testName: match[1].trim(),
                        status: 'pass',
                        filePath,
                        framework: 'appium',
                        timestamp: new Date(),
                        suiteName: currentSuite,
                        duration: this.extractDurationFromLine(line)
                    });
                }
            }
            
            // Test fail
            else if (line.match(/[✖×]\s*(.*?)$/)) {
                const match = line.match(/[✖×]\s*(.*?)$/);
                if (match) {
                    currentTest = {
                        testName: match[1].trim(),
                        status: 'fail',
                        filePath,
                        framework: 'appium',
                        timestamp: new Date(),
                        suiteName: currentSuite,
                        duration: this.extractDurationFromLine(line)
                    };
                    results.push(currentTest as TestResult);
                }
            }
            
            // Error details
            else if (currentTest && line.includes('Error:')) {
                const errorMatch = line.match(/Error:\s*(.*)/);
                if (errorMatch && currentTest.status === 'fail') {
                    currentTest.errorMessage = errorMatch[1];
                }
            }
        }
    }

    private parseJestOutput(output: string, filePath: string, results: TestResult[]): void {
        const lines = output.split('\n');
        
        for (const line of lines) {
            // PASS line
            if (line.includes('PASS') && line.includes('(')) {
                const testMatch = line.match(/(.*?)\s+\((\d+(?:\.\d+)?(?:ms|s))\)/);
                if (testMatch) {
                    results.push({
                        testName: testMatch[1].trim(),
                        status: 'pass',
                        filePath,
                        framework: 'appium',
                        timestamp: new Date(),
                        duration: this.parseDuration(testMatch[2])
                    });
                }
            }
            
            // FAIL line
            else if (line.includes('FAIL') && line.includes('(')) {
                const testMatch = line.match(/(.*?)\s+\((\d+(?:\.\d+)?(?:ms|s))\)/);
                if (testMatch) {
                    results.push({
                        testName: testMatch[1].trim(),
                        status: 'fail',
                        filePath,
                        framework: 'appium',
                        timestamp: new Date(),
                        duration: this.parseDuration(testMatch[2])
                    });
                }
            }
            
            // Error details
            else if (line.includes('Error:')) {
                const errorMatch = line.match(/Error:\s*(.*)/);
                if (errorMatch && results.length > 0) {
                    const lastTest = results[results.length - 1];
                    if (lastTest.status === 'fail') {
                        lastTest.errorMessage = errorMatch[1];
                    }
                }
            }
        }
    }

    private parseGenericOutput(output: string, filePath: string, results: TestResult[]): void {
        // Generic parsing for Appium server logs and other outputs
        const lines = output.split('\n');
        let currentTest: string | null = null;
        let errorBuffer: string[] = [];

        for (const line of lines) {
            // Test start
            if (line.includes('Starting test:') || line.includes('TEST START:')) {
                const testMatch = line.match(/Starting test:\s*(.*)|TEST START:\s*(.*)/);
                if (testMatch) {
                    currentTest = (testMatch[1] || testMatch[2]).trim();
                }
            }
            
            // Test pass
            else if (line.includes('TEST PASSED:') || line.includes('Test passed:')) {
                const testMatch = line.match(/TEST PASSED:\s*(.*)|Test passed:\s*(.*)/);
                if (testMatch && currentTest) {
                    results.push({
                        testName: currentTest,
                        status: 'pass',
                        filePath,
                        framework: 'appium',
                        timestamp: new Date()
                    });
                    currentTest = null;
                }
            }
            
            // Test fail
            else if (line.includes('TEST FAILED:') || line.includes('Test failed:')) {
                const testMatch = line.match(/TEST FAILED:\s*(.*)|Test failed:\s*(.*)/);
                if (testMatch && currentTest) {
                    results.push({
                        testName: currentTest,
                        status: 'fail',
                        filePath,
                        framework: 'appium',
                        timestamp: new Date(),
                        errorMessage: errorBuffer.join('\n')
                    });
                    currentTest = null;
                    errorBuffer = [];
                }
            }
            
            // Error information
            else if (line.includes('Error:') || line.includes('Exception:')) {
                errorBuffer.push(line);
            }
        }
    }

    private extractAppiumTags(content: string): string[] {
        const tags: string[] = ['appium', 'mobile'];
        
        // Detect platform tags
        if (content.includes('platformName')) {
            const platformMatch = content.match(/platformName\s*[:=]\s*['"](ios|android|windows|mac)['"]/i);
            if (platformMatch) {tags.push(platformMatch[1].toLowerCase());}
        }
        
        // Detect device type
        if (content.includes('deviceName') || content.includes('udid')) {
            tags.push('real-device');
        } else if (content.includes('emulator') || content.includes('simulator')) {
            tags.push('emulator');
        }
        
        return tags;
    }

    private extractDurationFromLine(line: string): number | undefined {
        const durationMatch = line.match(/\((\d+(?:\.\d+)?)(ms|s|m)\)/);
        if (durationMatch) {
            return this.parseDuration(durationMatch[1] + durationMatch[2]);
        }
        return undefined;
    }

    private parseDuration(durationStr: string): number {
        const match = durationStr.match(/(\d+(?:\.\d+)?)(ms|s|m)/);
        if (!match) {return 0;}
        
        let value = parseFloat(match[1]);
        const unit = match[2];
        
        if (unit === 's') {value *= 1000;}
        if (unit === 'm') {value *= 60000;}
        
        return Math.round(value);
    }

    private generateTestId(testName: string, filePath: string): string {
        return Buffer.from(`${filePath}:${testName}`).toString('base64');
    }
}