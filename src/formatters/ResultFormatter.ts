/**
 * Formats test results for CLI output
 */

import chalk from 'chalk';
import {
  PackageTestSummary,
  CommandTestResult,
  LibraryTestResult,
  ProgressEvent,
} from '../domain/models/types';

export class ResultFormatter {
  /**
   * Format progress event
   */
  formatProgress(event: ProgressEvent): string {
    const icon = this.getStageIcon(event.stage);
    return `${icon} ${event.message}`;
  }

  /**
   * Format complete test summary
   */
  formatSummary(summary: PackageTestSummary): string {
    const lines: string[] = [];

    lines.push('');
    lines.push(chalk.bold('📦 Package: ') + chalk.cyan(summary.package.name));
    lines.push(chalk.gray(`   Version: ${summary.package.version}`));
    if (summary.package.description) {
      lines.push(chalk.gray(`   ${summary.package.description}`));
    }
    lines.push('');

    // Group results by Node version
    const byNodeVersion = this.groupByNodeVersion(summary.results);

    for (const [nodeVersion, results] of Object.entries(byNodeVersion)) {
      lines.push(chalk.bold(`🐳 Node ${nodeVersion}`));

      for (const result of results) {
        lines.push(this.formatTestResult(result));
      }

      lines.push('');
    }

    // Summary
    lines.push(chalk.bold('📊 Summary'));
    lines.push(chalk.gray('─'.repeat(50)));
    lines.push(`  Total: ${summary.total} tests`);
    lines.push(`  ${chalk.green('Passed')}: ${summary.passed}`);
    lines.push(`  ${chalk.red('Failed')}: ${summary.failed}`);
    lines.push(`  Duration: ${summary.duration}ms`);
    lines.push('');

    // Detailed test breakdown
    lines.push(chalk.bold('📋 Test Details'));
    lines.push(chalk.gray('─'.repeat(50)));
    lines.push('');

    // Separate CLI and library tests
    const cliTests = summary.cliResults || [];
    const libraryTests = summary.libraryResults || [];

    // CLI Tests Section
    if (cliTests.length > 0) {
      lines.push(chalk.bold.blue('  🔧 CLI Tests'));

      // Group CLI tests by type
      const cliAiTests = cliTests.filter((r) => r.testType === 'ai-generated');
      const cliDefaultTests = cliTests.filter((r) => r.testType === 'default');
      const cliCustomTests = cliTests.filter((r) => r.testType === 'custom');

      if (cliDefaultTests.length > 0) {
        lines.push(chalk.bold.yellow('    🎯 Default Tests'));
        for (const test of cliDefaultTests) {
          const icon = test.passed ? chalk.green('    ✓') : chalk.red('    ✗');
          lines.push(
            `    ${icon} ${test.scenarioName || (test as CommandTestResult).command.name} ${chalk.gray(`(${test.duration}ms)`)}`,
          );
          if (!test.passed && test.error) {
            lines.push(`        ${chalk.red(test.error)}`);
          }
        }
      }

      if (cliAiTests.length > 0) {
        lines.push(chalk.bold.cyan('    🤖 AI-Generated Tests'));
        for (const test of cliAiTests) {
          const icon = test.passed ? chalk.green('    ✓') : chalk.red('    ✗');
          const args = (test as CommandTestResult).args && (test as CommandTestResult).args!.length > 0
            ? ` ${(test as CommandTestResult).args!.join(' ')}`
            : '';
          lines.push(
            `    ${icon} ${test.scenarioName || (test as CommandTestResult).command.name}${args} ${chalk.gray(`(${test.duration}ms)`)}`,
          );
          if (!test.passed && test.error) {
            lines.push(`        ${chalk.red(test.error)}`);
          }
        }
      }

      if (cliCustomTests.length > 0) {
        lines.push(chalk.bold.magenta('    🎨 Custom Tests'));
        for (const test of cliCustomTests) {
          const icon = test.passed ? chalk.green('    ✓') : chalk.red('    ✗');
          lines.push(
            `    ${icon} ${test.scenarioName || (test as CommandTestResult).command.name} ${chalk.gray(`(${test.duration}ms)`)}`,
          );
          if (!test.passed && test.error) {
            lines.push(`        ${chalk.red(test.error)}`);
          }
        }
      }

      lines.push('');
    }

    // Library Tests Section
    if (libraryTests.length > 0) {
      lines.push(chalk.bold.green('  📚 Library Tests'));

      // Group library tests by type
      const libAiTests = libraryTests.filter((r) => r.testType === 'ai-generated');
      const libDefaultTests = libraryTests.filter((r) => r.testType === 'library');

      if (libDefaultTests.length > 0) {
        lines.push(chalk.bold.yellow('    🎯 Default Tests'));
        for (const test of libDefaultTests) {
          const icon = test.passed ? chalk.green('    ✓') : chalk.red('    ✗');
          lines.push(`    ${icon} ${test.name} ${chalk.gray(`(${test.duration}ms)`)}`);
          if (!test.passed && test.error) {
            lines.push(`        ${chalk.red(test.error)}`);
          }
        }
      }

      if (libAiTests.length > 0) {
        lines.push(chalk.bold.cyan('    🤖 AI-Generated Tests'));
        for (const test of libAiTests) {
          const icon = test.passed ? chalk.green('    ✓') : chalk.red('    ✗');
          lines.push(`    ${icon} ${test.name} ${chalk.gray(`(${test.duration}ms)`)}`);
          if (!test.passed && test.error) {
            lines.push(`        ${chalk.red(test.error)}`);
          }
        }
      }

      lines.push('');
    }

    // Final result
    if (summary.success) {
      lines.push(chalk.green.bold('✅ All tests passed!'));
    } else {
      lines.push(chalk.red.bold('❌ Some tests failed'));
    }

    lines.push('');

    return lines.join('\n');
  }

  /**
   * Format individual test result
   */
  private formatTestResult(result: CommandTestResult): string {
    const icon = result.passed ? chalk.green('✓') : chalk.red('✗');
    const commandDesc = this.getCommandDescription(result);
    const duration = chalk.gray(`(${result.duration}ms)`);

    let line = `  ${icon} ${commandDesc} ${duration}`;

    // Add extra info for failed tests
    if (!result.passed && result.error) {
      line += `\n    ${chalk.red(result.error)}`;
    }

    return line;
  }

  /**
   * Get command description
   */
  private getCommandDescription(result: CommandTestResult): string {
    const cmd = result.command.name;

    // Determine what was tested
    if (result.hasHelpOutput && result.stdout.includes('--help')) {
      return `${cmd} --help`;
    } else if (result.hasVersionOutput) {
      return `${cmd} --version`;
    } else if (result.stdout === '' && result.stderr === '') {
      return `${cmd} [no args]`;
    } else {
      return cmd;
    }
  }

  /**
   * Group results by Node version
   */
  private groupByNodeVersion(
    results: readonly CommandTestResult[],
  ): Record<string, CommandTestResult[]> {
    const grouped: Record<string, CommandTestResult[]> = {};

    for (const result of results) {
      if (!grouped[result.nodeVersion]) {
        grouped[result.nodeVersion] = [];
      }
      grouped[result.nodeVersion].push(result);
    }

    return grouped;
  }

  /**
   * Get icon for test stage
   */
  private getStageIcon(stage: string): string {
    switch (stage) {
      case 'analyzing':
        return '🔍';
      case 'detecting-commands':
        return '📋';
      case 'pulling-image':
        return '⬇️ ';
      case 'creating-container':
        return '🐳';
      case 'installing-package':
        return '📥';
      case 'testing-command':
        return '🧪';
      case 'cleaning-up':
        return '🧹';
      case 'completed':
        return '✅';
      case 'error':
        return '❌';
      default:
        return '•';
    }
  }
}
