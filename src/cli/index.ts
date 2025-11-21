#!/usr/bin/env node

/**
 * CLI interface for npm-package-tester
 */

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { TestRunner } from '../application/TestRunner';
import { ResultFormatter } from '../formatters/ResultFormatter';
import { TestConfig } from '../domain/models/types';

const program = new Command();

program
  .name('npt')
  .description('Test npm packages by discovering and running CLI commands in Docker')
  .version('0.1.0');

program
  .command('test <package>')
  .description('Test an npm package or local directory')
  .option('-n, --node <versions>', 'Node versions to test (comma-separated)', '20')
  .option('-p, --parallel', 'Run tests in parallel', false)
  .option('-k, --keep-containers', 'Keep containers after test', false)
  .option('-t, --timeout <ms>', 'Timeout per test in milliseconds', '30000')
  .option('--npm-token <token>', 'npm authentication token for private packages')
  .option('--npm-registry <url>', 'Custom npm registry URL')
  .option('--no-help', 'Skip --help tests')
  .option('--no-version', 'Skip --version tests')
  .option('--ai-provider <provider>', 'AI provider (anthropic, openai, google, groq)')
  .option('--ai-token <token>', 'AI API token/key')
  .option('--ai-model <model>', 'AI model name (optional, auto-detects best)')
  .option('-v, --verbose', 'Verbose output')
  .action(async (packageSource: string, options: any) => {
    const spinner = ora('Starting tests...').start();
    let currentStage = '';

    try {
      const testRunner = new TestRunner();
      const formatter = new ResultFormatter();

      // Build AI config if provided
      let aiConfig;
      if (options.aiProvider && options.aiToken) {
        aiConfig = {
          provider: options.aiProvider,
          apiKey: options.aiToken,
          model: options.aiModel,
        };
      }

      const config: Partial<TestConfig> = {
        package: packageSource,
        nodeVersions: options.node.split(',').map((v: string) => v.trim()),
        parallel: options.parallel,
        keepContainers: options.keepContainers,
        timeout: parseInt(options.timeout, 10),
        skipDefaultTests: options.aiProvider ? true : false, // Skip default tests if using AI
        ai: aiConfig,
        npmToken: options.npmToken,
        npmRegistry: options.npmRegistry,
      };

      const result = await testRunner.testPackage(packageSource, config, (event) => {
        // Update spinner with progress
        if (options.verbose) {
          if (event.stage !== currentStage) {
            if (currentStage) {
              spinner.succeed();
            }
            currentStage = event.stage;
            spinner.start(formatter.formatProgress(event));
          } else {
            spinner.text = formatter.formatProgress(event);
          }
        } else {
          spinner.text = event.message;
        }
      });

      spinner.stop();

      // Check if no tests were run
      if (result.total === 0) {
        console.log('');
        console.log(chalk.yellow('⚠️  No tests were executed'));
        console.log('');
        console.log(chalk.gray('Package information:'));
        console.log(chalk.cyan(`  Name: ${result.package.name}`));
        console.log(chalk.cyan(`  Version: ${result.package.version}`));
        console.log('');

        if (result.package.type?.isCLI) {
          console.log(chalk.gray('🔧 CLI Package detected, but no CLI commands found'));
        } else if (result.package.type?.isLibrary) {
          console.log(chalk.gray('📚 Library Package detected'));
          console.log(chalk.gray('   Run with --ai-provider <provider> --ai-token <token> for AI-powered library testing'));
        } else {
          console.log(chalk.gray('📚 Tip: This package has no detectable CLI commands or library exports'));
          console.log(chalk.gray('   • For CLI packages, ensure it has a "bin" field in package.json'));
          console.log(chalk.gray('   • For library packages, ensure it has a "main" or "exports" field'));
        }

        console.log('');
        process.exit(0);
      }

      // Display results
      console.log(formatter.formatSummary(result));

      // Exit with appropriate code
      process.exit(result.success ? 0 : 1);
    } catch (error) {
      spinner.fail(chalk.red('Test failed'));
      console.error(chalk.red('Error:'), (error as Error).message);

      if (options.verbose && (error as Error).stack) {
        console.error(chalk.gray((error as Error).stack));
      }

      process.exit(1);
    }
  });

program
  .command('analyze <package>')
  .description('Analyze a package to see detected CLI commands')
  .action(async (packageSource: string) => {
    const spinner = ora('Analyzing package...').start();

    try {
      const { PackageAnalyzer } = await import('../application/PackageAnalyzer');
      const analyzer = new PackageAnalyzer();

      const packageInfo = await analyzer.analyze(packageSource);

      spinner.succeed(`Analyzed ${packageInfo.name}`);

      console.log('');
      console.log(chalk.bold('📦 Package Information'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(`  Name: ${chalk.cyan(packageInfo.name)}`);
      console.log(`  Version: ${chalk.cyan(packageInfo.version)}`);
      if (packageInfo.description) {
        console.log(`  Description: ${packageInfo.description}`);
      }
      console.log('');

      console.log(chalk.bold('🔧 CLI Commands'));
      console.log(chalk.gray('─'.repeat(50)));

      if (packageInfo.commands.length === 0) {
        console.log(chalk.yellow('⚠️  No CLI commands detected'));
        console.log('');
        if (packageInfo.type?.isLibrary) {
          console.log(chalk.gray('📚 This is a library package (has exports or main field)'));
          console.log(chalk.gray('   Use: npt test <package> for automated testing'));
        } else {
          console.log(chalk.gray('If you believe this is a CLI package, check that:'));
          console.log(chalk.gray('  • The package has a "bin" field in package.json'));
          console.log(chalk.gray('  • The "bin" field points to valid executable files'));
        }
      } else {
        packageInfo.commands.forEach((cmd) => {
          const typeColor =
            cmd.type === 'primary' ? chalk.green : cmd.type === 'alias' ? chalk.blue : chalk.gray;
          console.log(`  ${chalk.cyan(cmd.name)} ${typeColor(`[${cmd.type}]`)}`);
          console.log(chalk.gray(`    Path: ${cmd.path}`));
        });
      }

      console.log('');

      // Display library exports if available
      if (packageInfo.exports) {
        console.log(chalk.bold('📚 Library Exports'));
        console.log(chalk.gray('─'.repeat(50)));

        if (packageInfo.exports.hasDefaultExport) {
          console.log(`  ${chalk.cyan('default')} ${chalk.gray(`(${packageInfo.exports.defaultExportType || 'unknown'})`)}`);
        }

        if (packageInfo.exports.namedExports && packageInfo.exports.namedExports.length > 0) {
          console.log(chalk.gray('  Named exports:'));
          for (const exp of packageInfo.exports.namedExports) {
            // Format the export with type and description
            let exportLine = `    ${chalk.cyan(exp.name)} ${chalk.gray(`[${exp.type}]`)}`;

            // Add signature for functions
            if (exp.signature) {
              exportLine += ` ${chalk.gray(exp.signature)}`;
            }

            // Add description
            if (exp.description) {
              exportLine += ` - ${exp.description}`;
            }

            console.log(exportLine);

            // Show methods for classes
            if (exp.methods && exp.methods.length > 0) {
              console.log(chalk.gray('      Methods:'));
              for (const method of exp.methods) {
                const methodLine = `        ${chalk.yellow(method.name)}${method.signature ? ` ${chalk.gray(method.signature)}` : ''}${method.description ? ` - ${method.description}` : ''}`;
                console.log(methodLine);
              }
            }

            // Show properties for types/interfaces
            if (exp.properties && exp.properties.length > 0) {
              console.log(chalk.gray('      Properties:'));
              for (const prop of exp.properties) {
                const propLine = `        ${chalk.yellow(prop.name)}${prop.optional ? '?' : ''}: ${chalk.gray(prop.type || 'unknown')}${prop.description ? ` - ${prop.description}` : ''}`;
                console.log(propLine);
              }
            }
          }
        }

        if (packageInfo.exports.typeDefinitions) {
          console.log(`  ${chalk.green('✓')} TypeScript type definitions available`);
          if (packageInfo.exports.typesPath) {
            console.log(chalk.gray(`    Path: ${packageInfo.exports.typesPath}`));
          }
        }

        console.log('');
      }

      // Display package type summary
      if (packageInfo.type) {
        console.log(chalk.bold('📊 Package Type'));
        console.log(chalk.gray('─'.repeat(50)));

        if (packageInfo.type.isCLI) {
          console.log(`  ${chalk.green('✓')} CLI Package`);
        }

        if (packageInfo.type.isLibrary) {
          console.log(`  ${chalk.green('✓')} Library Package`);
        }

        if (packageInfo.type.hasNoExports) {
          console.log(`  ${chalk.yellow('⚠️')}  No testable exports found`);
        }

        console.log('');
      }
    } catch (error) {
      spinner.fail(chalk.red('Analysis failed'));
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

program.parse();
