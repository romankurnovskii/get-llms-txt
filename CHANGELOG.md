# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [1.0.0] - 2025-12-27

### Features

- Initial release of `next-llms-txt`
- Generate `llms.txt` files for Next.js projects following the [llms.txt specification](https://llmstxt.org/)
- Support for both MDX and Markdown files
- Automatic metadata extraction from:
  - YAML frontmatter format
  - Next.js `export const metadata` format
- Convert MDX files to plain markdown:
  - Remove JSX components
  - Strip import statements
  - Preserve markdown structure
- Generate categorized file lists in `llms.txt`
- Create individual markdown files in `<output-dir>/md/` directory
- CLI interface with configurable options:
  - Custom content directory
  - Custom output directory
  - Base URL configuration
  - Project name and description
- Programmatic API for integration into build scripts
- Support for locale suffixes (`.en`, `.ru`, etc.)
- Automatic handling of index files
- TypeScript support with full type definitions

### Technical Details

- Built with TypeScript
- Uses `glob` for file discovery
- Uses `commander` for CLI interface
- Comprehensive test suite
- Node.js 22+ required
