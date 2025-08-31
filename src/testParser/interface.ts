export interface TestResult {
    testName: string;
    status: 'pass' | 'fail' | 'skipped' | 'unknown';
    filePath: string;
    framework: string;
    timestamp: Date;
    duration?: number;
    errorMessage?: string;
    stackTrace?: string;
    expectedResult?: string;
    actualResult?: string;
    tags?: string[];
    browser?: string;
    device?: string;
    os?: string;
    testId?: string;
    suiteName?: string;
}

export interface ITestParser {
    parseTestFile(filePath: string): Promise<TestResult[]>;
    parseTestOutput(output: string, filePath: string): Promise<TestResult[]>;
    supportsFile(filePath: string): boolean;
}

export interface TestExecution {
    command: string;
    output: string;
    exitCode: number;
    timestamp: Date;
}

export interface ParserConfig {
    includePassed: boolean;
    includeSkipped: boolean;
    captureScreenshots: boolean;
    maxErrorLength: number;
}