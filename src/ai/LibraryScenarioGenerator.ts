/**
 * Generates library test scenarios using AI
 */

import {
  PackageInfo,
  LibraryTestScenario,
  AIConfig,
  LibraryExports,
  CLIExample,
} from '../domain/models/types';
import { AIProviderFactory } from './AIProvider';

export interface AILibraryProviderClient {
  generateLibraryScenarios(
    packageName: string,
    packageDescription: string,
    readme: string,
    libraryExports: LibraryExports,
    examples?: readonly CLIExample[],
  ): Promise<LibraryTestScenario[]>;
}

export class LibraryScenarioGenerator {
  /**
   * Generate library test scenarios using AI
   */
  async generateScenarios(
    packageInfo: PackageInfo,
    libraryExports: LibraryExports,
    aiConfig: AIConfig,
  ): Promise<LibraryTestScenario[]> {
    // Get README (if available from npm)
    const readme = await this.fetchReadme(packageInfo.name);

    // Use AI to generate scenarios
    const aiProvider = AIProviderFactory.create(aiConfig);

    const scenarios = await this.generateWithAI(
      packageInfo.name,
      packageInfo.description || '',
      readme,
      libraryExports,
      packageInfo.examples,
      aiProvider,
    );

    return scenarios;
  }

  /**
   * Generate scenarios using AI provider
   */
  private async generateWithAI(
    packageName: string,
    packageDescription: string,
    readme: string,
    libraryExports: LibraryExports,
    examples: readonly CLIExample[] | undefined,
    aiProvider: any,
  ): Promise<LibraryTestScenario[]> {
    const prompt = this.buildPrompt(
      packageName,
      packageDescription,
      readme,
      libraryExports,
      examples,
    );

    const response = await (aiProvider as any).generateLibraryScenarios(
      packageName,
      packageDescription,
      readme,
      libraryExports,
      examples,
    );

    return response;
  }

  /**
   * Build prompt for library scenario generation
   */
  private buildPrompt(
    packageName: string,
    packageDescription: string,
    readme: string,
    libraryExports: LibraryExports,
    examples?: readonly CLIExample[],
  ): string {
    const exportsInfo = this.formatExports(libraryExports);

    return `You are a software testing expert. Generate realistic test scenarios for the npm library package "${packageName}".

Package Information:
- Name: ${packageName}
- Description: ${packageDescription}
- Exports: ${exportsInfo}

README Content (first 1000 chars):
${readme.substring(0, 1000)}

${examples && examples.length > 0 ? `Examples from package:\n${examples.map((e) => `- ${e.description}: ${e.command}`).join('\n')}\n` : ''}

Generate 2-4 realistic test scenarios for this library package. Each scenario should:
1. Test a different exported function/class/utility
2. Include realistic usage patterns
3. Cover common use cases from the documentation

For each scenario, provide:
- name: A descriptive test scenario name
- description: What this test validates
- importStatement: How to import (e.g., "const { func } = require('${packageName}')" or "import func from '${packageName}'")
- testCode: JavaScript code that imports and uses the export. The code should call console.log with the result. The code must be executable as-is.
- expectedOutput: A regex pattern or string the output should match
- expectError: true if the test should result in an error

Format as JSON with a "scenarios" array. Example:
\`\`\`json
{
  "scenarios": [
    {
      "name": "basic-usage",
      "description": "Test basic usage of the main export",
      "importStatement": "const lib = require('${packageName}')",
      "testCode": "const result = lib.transform('input'); console.log(JSON.stringify(result))",
      "expectedOutput": "{\\"result\\":\\".*\\"}",
      "expectError": false
    }
  ]
}
\`\`\`

Generate realistic scenarios now:`;
  }

  /**
   * Format library exports for the prompt
   */
  private formatExports(exports: LibraryExports): string {
    const parts: string[] = [];

    if (exports.hasDefaultExport) {
      parts.push(`Default export (${exports.defaultExportType || 'unknown type'})`);
    }

    if (exports.namedExports && exports.namedExports.length > 0) {
      const exportNames = exports.namedExports
        .slice(0, 5)
        .map((e) => `${e.name} (${e.type})`)
        .join(', ');
      if (exports.namedExports.length > 5) {
        parts.push(`Named exports: ${exportNames}, +${exports.namedExports.length - 5} more`);
      } else {
        parts.push(`Named exports: ${exportNames}`);
      }
    }

    if (exports.typeDefinitions) {
      parts.push('TypeScript type definitions available');
    }

    return parts.length > 0 ? parts.join('; ') : 'No exports detected';
  }

  /**
   * Fetch README from npm
   */
  private async fetchReadme(packageName: string): Promise<string> {
    try {
      const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`);
      if (!response.ok) {
        return '';
      }
      const data = (await response.json()) as any;
      return data.readme || '';
    } catch {
      return '';
    }
  }
}
