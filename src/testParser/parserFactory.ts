import { SeleniumParser } from './seleniumParser';
import { AppiumParser } from './appiumParser';
import { PlaywrightParser } from './plawrightParser';
import { ITestParser, ParserConfig } from './interface';

export class ParserFactory {
    static getParser(filePath: string, config?: Partial<ParserConfig>): ITestParser | null {
        const extension = filePath.split('.').pop()?.toLowerCase();
        const fileName = filePath.toLowerCase();
        
        if (fileName.includes('selenium') || fileName.includes('webdriver')) {
            return new SeleniumParser();
        } else if (fileName.includes('appium') || fileName.includes('mobile')) {
            return new AppiumParser(config);
        } else if (fileName.includes('playwright') || 
                  extension === 'spec.js' || 
                  extension === 'spec.ts' ||
                  fileName.includes('test') ||
                  fileName.includes('spec')) {
            return new PlaywrightParser(config);
        }
        
        return null;
    }

    static getAllParsers(config?: Partial<ParserConfig>): ITestParser[] {
        return [
            new SeleniumParser(),
            new AppiumParser(config),
            new PlaywrightParser(config)
        ];
    }

    static getParserForFramework(framework: string, config?: Partial<ParserConfig>): ITestParser | null {
        switch (framework.toLowerCase()) {
            case 'selenium':
                return new SeleniumParser();
            case 'appium':
                return new AppiumParser(config);
            case 'playwright':
                return new PlaywrightParser(config);
            default:
                return null;
        }
    }
}