<h1 align="center">next-llms-txt<br>Generate LLM-friendly llms.txt files for Next.js projects</h1>

<p align="center">
  Generate <code>llms.txt</code> files and markdown versions of all content files for LLM consumption, following the <a href="https://llmstxt.org/">llms.txt specification</a>. Optimized for Next.js projects using MDX/MD files, but works with any project that uses markdown or MDX content.
</p>

[![NPM version][npm-image]][npm-url]
![npm-typescript]
[![License][github-license]][github-license-url]

## 🌟 Features

- 🔍 **Markdown/MDX scanning** - Recursively finds all `.mdx` and `.md` files in your content directory
- 📄 **Generate `llms.txt`** - High-level, markdown-like index of your project with categorized file lists
- 📚 **Markdown conversion** - Converts MDX files to plain markdown, removing JSX components and metadata
- 🎛️ **Configurable** - Customize content directory, output directory, base URL, and project metadata
- 🧰 **CLI + API** - Use as a CLI tool or call programmatically in your own scripts
- ⚡ **Fast and efficient** - Only processes content files, ignores `node_modules`, `.next`, and `out` directories

## 📖 Usage

### CLI Usage

Install the package:

```sh
npm install --save-dev next-llms-txt
```

or

```sh
yarn add -D next-llms-txt
```

or

```sh
pnpm add -D next-llms-txt
```

Run the CLI:

```sh
npx next-llms-txt
```

By default, this will:

- Scan `./content` directory for `.mdx` and `.md` files
- Generate `llms.txt` in `./out` (if exists) or `./public`
- Create plain markdown versions in `<output-dir>/md/` directory

**Basic usage for MD/MDX files:**

The tool processes any `.md` or `.mdx` files in your content directory:
- Extracts metadata (title, description, tags)
- Converts MDX to plain markdown (removes JSX components)
- Generates categorized `llms.txt` index file
- Creates individual `.md` files for each content file

### CLI Options

```sh
npx next-llms-txt [options]
```

**Options:**

- `-c, --content-dir <dir>` - Content directory to scan (default: `./content`)
- `-o, --output-dir <dir>` - Output directory for `llms.txt` and md files (default: `./out` if exists, otherwise `./public`)
- `-u, --base-url <url>` - Base URL for links in `llms.txt` (default: empty)
- `-n, --project-name <name>` - Project name for `llms.txt` (default: "Personal Website & Blog")
- `-d, --project-description <desc>` - Project description (default: auto-generated)
- `-h, --help` - Show help message

### Examples

```sh
# Use default settings
npx next-llms-txt

# Specify custom directories
npx next-llms-txt --content-dir ./content --output-dir ./out

# With base URL for production
npx next-llms-txt --base-url https://example.com --output-dir ./out

# Custom project name and description
npx next-llms-txt --project-name "My Blog" --project-description "Technical blog about software development"
```

### Programmatic Usage

```typescript
import {generateLlmsFiles} from 'next-llms-txt';

await generateLlmsFiles({
  contentDir: './content',
  outputDir: './out',
  baseUrl: 'https://example.com',
  projectName: 'My Next.js Project',
  projectDescription: 'A collection of technical content',
});
```

## 🛠️ Installation

```sh
npm install --save-dev next-llms-txt
```

## API

### `generateLlmsFiles(options: GenerateOptions): Promise<void>`

Main function to generate llms.txt files.

**Parameters:**

- `options.contentDir` (string) - Content directory to scan
- `options.outputDir` (string) - Output directory for llms.txt and md files
- `options.baseUrl?` (string) - Base URL for links in llms.txt
- `options.projectName?` (string) - Project name for llms.txt
- `options.projectDescription?` (string) - Project description

### `processMDXFile(filePath: string): ProcessedContent`

Process an MDX file and extract metadata and content.

### `processMDFile(filePath: string): ProcessedContent`

Process a Markdown file and extract metadata and content.

### `extractTitle(filePath: string, metadata: FileMetadata, content: string): string`

Extract title from file metadata, first H1, or filename.

### `extractDescription(metadata: FileMetadata, content: string): string | undefined`

Extract description from metadata or first paragraph.

## What It Does

1. **Scans Content Directory**: Recursively finds all `.mdx` and `.md` files in the content directory
2. **Extracts Metadata**: Extracts title, description, and other metadata from MDX files
3. **Converts to Markdown**:
   - Removes MDX metadata exports
   - Strips JSX components
   - Converts to plain markdown
4. **Generates Individual .md Files**: Creates markdown versions in `<output-dir>/md/` directory
5. **Generates llms.txt**: Creates `llms.txt` file in the output directory with:
   - Project name and description
   - Content structure overview
   - Categorized file lists with links

## Output Structure

```
<output-dir>/
  ├── llms.txt
  └── md/
      ├── blog/
      │   ├── post1.md
      │   └── ...
      ├── apps/
      │   ├── app1.md
      │   └── ...
      └── research/
          └── ...
```

## File Processing

### MDX Files

The script supports **two common metadata formats** used in Next.js projects:

1. **YAML Frontmatter** (most common):

   ```mdx
   ---
   title: My Post
   description: A great post
   tags: [blog, tech]
   ---

   # My Post

   Content here...
   ```

2. **Export const metadata** (Next.js MDX format):

   ```mdx
   export const metadata = {
     title: 'My Post',
     description: 'A great post',
     tags: ['blog', 'tech'],
   };

   # My Post

   Content here...
   ```

The script automatically detects and handles both formats. It also:

- Removes React/JSX components
- Strips import statements
- Converts to plain markdown
- Preserves markdown structure

### MD Files

- Extracts YAML frontmatter (if present)
- Preserves markdown content as-is

## Integration with Build Process

For Next.js static export (or any static site generator), add to your build script:

```json
{
  "scripts": {
    "build": "next build && npx next-llms-txt --output-dir ./out",
    "deploy:prod": "next build && npx next-llms-txt --output-dir ./out --base-url https://example.com && firebase deploy --only hosting"
  }
}
```

## Compatibility

✅ **Optimized for Next.js projects** using MDX/MD files, but also works with:

- ✅ Any static site generator (Gatsby, Astro, etc.)
- ✅ Documentation sites (Docusaurus, VitePress, etc.)
- ✅ Any project with markdown/MDX content files

**Supported formats:**

- ✅ YAML frontmatter (most common)
- ✅ `export const metadata` (Next.js MDX format)
- ✅ Mixed formats
- ✅ Files with no metadata (falls back to filename/H1 extraction)
- ✅ Any directory structure (recursively scans)
- ✅ Locale suffixes (`.en`, `.ru`, etc.) are handled automatically

**Requirements:**

- Node.js 22+
- MDX or MD files in a content directory (configurable)
- TypeScript support (for programmatic usage)

## URL Generation

- Locale suffixes (`.en`, `.ru`) are removed from filenames
- All files are converted to `.md` extension
- Directory structure is preserved
- URLs are relative to the base URL (if provided)
- Index files are handled specially (uses directory name)

## License

MIT

[package-name]: next-llms-txt
[npm-url]: https://www.npmjs.com/package/next-llms-txt
[npm-image]: https://img.shields.io/npm/v/next-llms-txt
[github-license]: https://img.shields.io/github/license/romankurnovskii/next-llms-txt
[github-license-url]: https://github.com/romankurnovskii/next-llms-txt/blob/main/LICENSE
[npm-typescript]: https://img.shields.io/npm/types/next-llms-txt
[build-status]: https://github.com/romankurnovskii/next-llms-txt/workflows/CI/badge.svg
[build-status-url]: https://github.com/romankurnovskii/next-llms-txt
[install-size]: https://packagephobia.com/badge?p=next-llms-txt
[install-size-url]: https://packagephobia.com/result?p=next-llms-txt
