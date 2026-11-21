import * as fs from 'node:fs'
import * as path from 'node:path'
import { glob } from 'glob'

export interface GenerateOptions {
  contentDir: string
  outputDir: string
  baseUrl?: string
  projectName?: string
  projectDescription?: string
}

export interface ProcessedFile {
  relativePath: string
  url: string
  title: string
  description?: string
  category: string
}

export interface FileMetadata {
  title?: string
  description?: string
  slug?: string
  tags?: string[]
  [key: string]: unknown
}

export interface ProcessedContent {
  metadata: FileMetadata
  content: string
}

/**
 * Matches a fenced code block, including its opening and closing fence lines.
 * The backreference keeps the closing fence on the same character as the
 * opening one, so a ```` block may contain ``` lines. Covers ``` and ~~~.
 */
const FENCED_CODE_BLOCK = /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[^\n]*$/gm

/**
 * Remove fenced code blocks so line-oriented scans (e.g. the H1 lookup) cannot
 * match a line that is only an example.
 */
function stripFencedCodeBlocks(markdown: string): string {
  return markdown.replace(FENCED_CODE_BLOCK, '')
}

/**
 * Remove JSX components and imports, leaving fenced code blocks untouched:
 * inside a fence those lines are sample code, not MDX syntax.
 */
function stripMdxSyntaxOutsideFences(markdown: string): string {
  let result = ''
  let cursor = 0
  for (const match of markdown.matchAll(FENCED_CODE_BLOCK)) {
    const start = match.index ?? 0
    result += stripMdxSyntax(markdown.slice(cursor, start))
    result += match[0]
    cursor = start + match[0].length
  }
  return result + stripMdxSyntax(markdown.slice(cursor))
}

function stripMdxSyntax(markdown: string): string {
  return markdown
    .replace(/<[A-Z][\w]*[^>]*>[\s\S]*?<\/[A-Z][\w]*>/g, '') // Remove JSX components
    .replace(/<[A-Z][\w]*[^>]*\/>/g, '') // Remove self-closing JSX components
    .replace(/import\s+.*?from\s+['"][^'"]+['"];?\s*\n?/g, '') // Remove imports
}

/**
 * Extract metadata values from JS object string using regex
 */
export function extractMetadataValues(metadataStr: string): FileMetadata {
  const metadata: FileMetadata = {}

  // Extract title
  const titleMatch = metadataStr.match(/title:\s*(["'])(.*?)\1/)
  if (titleMatch) {
    metadata.title = titleMatch[2]
  }

  // Extract description
  const descMatch = metadataStr.match(/description:\s*(["'])(.*?)\1/)
  if (descMatch) {
    metadata.description = descMatch[2]
  }

  // Extract slug
  const slugMatch = metadataStr.match(/slug:\s*(["'])(.*?)\1/)
  if (slugMatch) {
    metadata.slug = slugMatch[2]
  }

  // Extract tags array
  const tagsMatch = metadataStr.match(/tags:\s*\[([^\]]+)\]/)
  if (tagsMatch?.[1]) {
    const tagsStr = tagsMatch[1]
    const tags = tagsStr
      .split(',')
      .map((t) => t.trim().replace(/['"]/g, ''))
      .filter((t) => t.length > 0)
    if (tags.length > 0) {
      metadata.tags = tags
    }
  }

  return metadata
}

/**
 * Extract metadata and content from MDX file
 * Supports both:
 * 1. YAML frontmatter (---\n...\n---)
 * 2. export const metadata = {...} (Next.js MDX format)
 */
export function processMDXFile(filePath: string): ProcessedContent {
  const content = fs.readFileSync(filePath, 'utf-8')
  let metadata: FileMetadata = {}
  let markdownContent = content

  // Try YAML frontmatter first (common in many Next.js projects)
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/)
  if (frontmatterMatch?.[1]) {
    const frontmatter = frontmatterMatch[1]
    markdownContent = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '')

    // Parse YAML frontmatter
    frontmatter.split('\n').forEach((line) => {
      const match = line.match(/^(\w+):\s*(.+)$/)
      if (match) {
        const key = match[1]?.trim()
        let value: unknown = match[2]?.trim().replace(/^['"]|['"]$/g, '')
        // Handle arrays
        if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
          value = value
            .slice(1, -1)
            .split(',')
            .map((v: string) => v.trim().replace(/['"]/g, ''))
            .filter((v: string) => v.length > 0)
        }
        if (key) {
          metadata[key] = value
        }
      }
    })
  } else {
    // Try export const metadata format (this project's format)
    const metadataMatch = content.match(/^export\s+const\s+metadata\s*=\s*({[\s\S]*?});?\s*\n/m)
    if (metadataMatch) {
      const metadataStr = metadataMatch[1]
      if (metadataStr) {
        metadata = extractMetadataValues(metadataStr)
        markdownContent = content.replace(/^export\s+const\s+metadata\s*=\s*({[\s\S]*?});?\s*\n?/m, '')
      }
    }
  }

  // Remove JSX components and convert to plain markdown where possible
  // For now, we'll keep most MDX syntax but remove React components
  markdownContent = stripMdxSyntaxOutsideFences(markdownContent)

  return { metadata, content: markdownContent.trim() }
}

/**
 * Process MD file (simpler, no metadata extraction needed)
 */
export function processMDFile(filePath: string): ProcessedContent {
  const content = fs.readFileSync(filePath, 'utf-8')

  // Try to extract frontmatter if present
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/)
  const metadata: FileMetadata = {}
  let markdownContent = content

  if (frontmatterMatch?.[1]) {
    const frontmatter = frontmatterMatch[1]
    markdownContent = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '')

    // Simple frontmatter parsing
    frontmatter.split('\n').forEach((line) => {
      const match = line.match(/^(\w+):\s*(.+)$/)
      if (match) {
        const key = match[1]?.trim()
        const value = match[2]?.trim().replace(/^['"]|['"]$/g, '')
        if (key) {
          metadata[key] = value
        }
      }
    })
  }

  return { metadata, content: markdownContent.trim() }
}

/**
 * Get title from file (from metadata, frontmatter, or first H1)
 */
export function extractTitle(filePath: string, metadata: FileMetadata, content: string): string {
  if (metadata.title) {
    return metadata.title
  }

  // Try to extract from first H1, ignoring headings that are only code samples
  const h1Match = stripFencedCodeBlocks(content).match(/^#\s+(.+)$/m)
  if (h1Match) {
    return h1Match[1]?.trim() || ''
  }

  // Fallback to filename
  const basename = path.basename(filePath, path.extname(filePath))
  return basename.replace(/[-_]/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}

/**
 * Get description from metadata or extract from content
 */
export function extractDescription(metadata: FileMetadata, content: string): string | undefined {
  if (metadata.description) {
    return metadata.description
  }

  // Try to extract first paragraph
  const paragraphMatch = content.match(/^([^\n#].{50,200})/m)
  if (paragraphMatch) {
    return paragraphMatch[1]?.trim().replace(/\n/g, ' ').substring(0, 200)
  }

  return undefined
}

/**
 * Discover and process all MDX/MD files
 */
export async function discoverFiles(contentDir: string, outputDir: string): Promise<ProcessedFile[]> {
  const files: ProcessedFile[] = []

  // Find all .mdx and .md files
  const mdxFiles = await glob('**/*.{mdx,md}', {
    cwd: contentDir,
    absolute: false,
    ignore: ['node_modules/**', '.next/**', 'out/**'],
  })

  for (const file of mdxFiles) {
    const filePath = path.join(contentDir, file)
    const ext = path.extname(file)

    let result: ProcessedContent

    if (ext === '.mdx') {
      result = processMDXFile(filePath)
    } else {
      result = processMDFile(filePath)
    }

    const title = extractTitle(filePath, result.metadata, result.content)
    const description = extractDescription(result.metadata, result.content)

    // Determine category from path
    const parts = file.split(path.sep)
    const category = parts[0] || 'other'

    // Generate URL path (remove locale suffix like .en, .ru from filename)
    // Keep directory structure but normalize filename
    let urlPath = file
      .replace(/\.(en|ru)\.(mdx|md)$/, '.$2') // Remove locale from filename
      .replace(/\.(mdx|md)$/, '.md') // Convert all to .md

    // Handle index files - if filename is index.md, use directory name.
    // A root index.md has dir '.', which must keep its own name: path.basename('.')
    // is '.', so joining would produce '..md'.
    const dir = path.dirname(urlPath)
    const basename = path.basename(urlPath, '.md')
    if ((basename === 'index' || basename === '_index') && dir !== '.') {
      urlPath = path.join(dir, `${path.basename(dir)}.md`)
    }

    files.push({
      relativePath: file,
      url: `/md/${urlPath}`,
      title,
      description,
      category,
    })

    // Write individual .md file
    const outputMdPath = path.join(outputDir, 'md', urlPath)
    const outputMdDir = path.dirname(outputMdPath)

    if (!fs.existsSync(outputMdDir)) {
      fs.mkdirSync(outputMdDir, { recursive: true })
    }

    fs.writeFileSync(outputMdPath, result.content, 'utf-8')
  }

  return files
}

/**
 * Generate llms.txt file
 */
export function generateLLMsTxt(
  files: ProcessedFile[],
  outputDir: string,
  options: {
    projectName?: string
    projectDescription?: string
    baseUrl?: string
  },
): void {
  const projectName = options.projectName || 'Personal Website & Blog'
  const projectDescription =
    options.projectDescription ||
    'A collection of blog posts, research articles, and app descriptions covering software development, algorithms, and technical tutorials.'
  const baseUrl = options.baseUrl || ''

  // Group files by category
  const filesByCategory = new Map<string, ProcessedFile[]>()
  for (const file of files) {
    if (!filesByCategory.has(file.category)) {
      filesByCategory.set(file.category, [])
    }
    const categoryFiles = filesByCategory.get(file.category)
    if (categoryFiles) {
      categoryFiles.push(file)
    }
  }

  // Build llms.txt content
  let llmsTxt = `# ${projectName}\n\n`
  llmsTxt += `> ${projectDescription}\n\n`
  llmsTxt +=
    'This website contains technical content including blog posts, research articles, and application descriptions. '
  llmsTxt += 'All content is available in markdown format for easy consumption by language models.\n\n'
  llmsTxt += '## Content Structure\n\n'
  llmsTxt += '- **Blog Posts**: Technical tutorials and guides\n'
  llmsTxt += '- **Research Articles**: Academic and research content\n'
  llmsTxt += '- **Apps**: Application descriptions and documentation\n\n'

  // Add file lists by category
  for (const [category, categoryFiles] of filesByCategory.entries()) {
    const categoryName = category.charAt(0).toUpperCase() + category.slice(1)
    llmsTxt += `## ${categoryName}\n\n`

    // Sort files by title
    const sortedFiles = [...categoryFiles].sort((a, b) => a.title.localeCompare(b.title))

    for (const file of sortedFiles) {
      const url = baseUrl + file.url
      llmsTxt += `- [${file.title}](${url})`
      if (file.description) {
        llmsTxt += `: ${file.description}`
      }
      llmsTxt += '\n'
    }

    llmsTxt += '\n'
  }

  // Write llms.txt
  const outputPath = path.join(outputDir, 'llms.txt')
  fs.writeFileSync(outputPath, llmsTxt, 'utf-8')
}

/**
 * Main function to generate llms.txt files
 */
export async function generateLlmsFiles(options: GenerateOptions): Promise<void> {
  // Resolve paths
  const contentDir = path.resolve(process.cwd(), options.contentDir)
  const outputDir = path.resolve(process.cwd(), options.outputDir)

  if (!fs.existsSync(contentDir)) {
    throw new Error(`Content directory not found: ${contentDir}`)
  }

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // Ensure md subdirectory exists
  const mdDir = path.join(outputDir, 'md')
  if (!fs.existsSync(mdDir)) {
    fs.mkdirSync(mdDir, { recursive: true })
  }

  const files = await discoverFiles(contentDir, outputDir)

  generateLLMsTxt(files, outputDir, {
    projectName: options.projectName,
    projectDescription: options.projectDescription,
    baseUrl: options.baseUrl,
  })
}
