#!/usr/bin/env node
import {Command} from 'commander';
import {generateLlmsFiles, type GenerateOptions} from './index.js';
import * as fs from 'fs';
import * as path from 'path';

const program = new Command();

program
  .name('next-llms-txt')
  .description('Generate LLM-friendly llms.txt files for your Next.js project')
  .version('1.0.0');

program
  .option('-c, --content-dir <dir>', 'Content directory to scan', './content')
  .option('-o, --output-dir <dir>', 'Output directory for llms.txt and md files')
  .option('-u, --base-url <url>', 'Base URL for links in llms.txt', '')
  .option(
    '-n, --project-name <name>',
    'Project name for llms.txt',
    'Personal Website & Blog',
  )
  .option('-d, --project-description <desc>', 'Project description')
  .action(async options => {
    try {
      // Default to 'out' if it exists (Next.js static export), otherwise 'public'
      let defaultOutputDir = './public';
      if (fs.existsSync('./out')) {
        defaultOutputDir = './out';
      }

      const generateOptions: GenerateOptions = {
        contentDir: options.contentDir || './content',
        outputDir: options.outputDir || defaultOutputDir,
        baseUrl: options.baseUrl,
        projectName: options.projectName,
        projectDescription: options.projectDescription,
      };

      const contentDir = path.resolve(process.cwd(), generateOptions.contentDir);
      const outputDir = path.resolve(process.cwd(), generateOptions.outputDir);

      console.log(`Scanning content directory: ${contentDir}`);
      console.log(`Output directory: ${outputDir}\n`);

      await generateLlmsFiles(generateOptions);

      // Count generated files
      const mdDir = path.join(outputDir, 'md');
      let fileCount = 0;
      if (fs.existsSync(mdDir)) {
        const countFiles = (dir: string): number => {
          let count = 0;
          const files = fs.readdirSync(dir);
          for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
              count += countFiles(filePath);
            } else if (file.endsWith('.md')) {
              count++;
            }
          }
          return count;
        };
        fileCount = countFiles(mdDir);
      }

      console.log(`\n✓ Successfully generated llms.txt and ${fileCount} markdown files`);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parse();
