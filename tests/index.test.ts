import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  discoverFiles,
  extractDescription,
  extractMetadataValues,
  extractTitle,
  generateLLMsTxt,
  processMDFile,
  processMDXFile,
} from '../src/index.js'

describe('extractMetadataValues', () => {
  it('should extract title from metadata string', () => {
    const metadataStr = `{ title: 'My Post', description: 'A great post' }`
    const result = extractMetadataValues(metadataStr)
    expect(result.title).toBe('My Post')
    expect(result.description).toBe('A great post')
  })

  it('should extract tags array from metadata string', () => {
    const metadataStr = `{ title: 'My Post', tags: ['blog', 'tech', 'nextjs'] }`
    const result = extractMetadataValues(metadataStr)
    expect(result.tags).toEqual(['blog', 'tech', 'nextjs'])
  })

  it('should handle empty metadata string', () => {
    const result = extractMetadataValues('{}')
    expect(result).toEqual({})
  })

  it('should extract metadata values that contain inner quotes', () => {
    const metadataStr = `{ title: "Don't panic: a guide", description: 'Use "quotes"', slug: "don't-panic" }`
    const result = extractMetadataValues(metadataStr)
    expect(result.title).toBe("Don't panic: a guide")
    expect(result.description).toBe('Use "quotes"')
    expect(result.slug).toBe("don't-panic")
  })
})

describe('extractTitle', () => {
  it('should extract title from metadata', () => {
    const metadata = { title: 'My Post' }
    const content = '# Different Title'
    const filePath = '/test/file.mdx'
    const result = extractTitle(filePath, metadata, content)
    expect(result).toBe('My Post')
  })

  it('should extract title from first H1 if no metadata', () => {
    const metadata = {}
    const content = '# My Post Title\n\nContent here'
    const filePath = '/test/file.mdx'
    const result = extractTitle(filePath, metadata, content)
    expect(result).toBe('My Post Title')
  })

  it('should fallback to filename if no title or H1', () => {
    const metadata = {}
    const content = 'Just some content without a title'
    const filePath = '/test/my-awesome-post.mdx'
    const result = extractTitle(filePath, metadata, content)
    expect(result).toBe('My Awesome Post')
  })

  it('should ignore H1-looking lines inside fenced code blocks', () => {
    const metadata = {}
    const content = '```bash\n# install deps\nnpm i\n```\n\n# Real Title'
    const filePath = '/test/setup.md'
    const result = extractTitle(filePath, metadata, content)
    expect(result).toBe('Real Title')
  })
})

describe('extractDescription', () => {
  it('should extract description from metadata', () => {
    const metadata = { description: 'A great post about Next.js' }
    const content = 'Different content here'
    const result = extractDescription(metadata, content)
    expect(result).toBe('A great post about Next.js')
  })

  it('should extract first paragraph if no metadata description', () => {
    const metadata = {}
    const content =
      'This is a long paragraph that should be extracted as the description because it is more than 50 characters long and contains useful information.'
    const result = extractDescription(metadata, content)
    expect(result).toBeTruthy()
    expect(result?.length).toBeLessThanOrEqual(200)
  })

  it('should return undefined if no description available', () => {
    const metadata = {}
    const content = '# Title\n\nShort'
    const result = extractDescription(metadata, content)
    expect(result).toBeUndefined()
  })
})

describe('processMDXFile', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'get-llms-txt-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('should process MDX file with export const metadata', () => {
    const filePath = path.join(tempDir, 'test.mdx')
    const content = `export const metadata = {
      title: 'My Post',
      description: 'A great post',
      tags: ['blog', 'tech'],
    };

# My Post

Content here...`

    fs.writeFileSync(filePath, content, 'utf-8')
    const result = processMDXFile(filePath)

    expect(result.metadata.title).toBe('My Post')
    expect(result.metadata.description).toBe('A great post')
    expect(result.metadata.tags).toEqual(['blog', 'tech'])
    expect(result.content).toContain('# My Post')
    expect(result.content).toContain('Content here...')
    expect(result.content).not.toContain('export const metadata')
  })

  it('should process MDX file with YAML frontmatter', () => {
    const filePath = path.join(tempDir, 'test.mdx')
    const content = `---
title: My Post
description: A great post
tags: [blog, tech]
---

# My Post

Content here...`

    fs.writeFileSync(filePath, content, 'utf-8')
    const result = processMDXFile(filePath)

    expect(result.metadata.title).toBe('My Post')
    expect(result.metadata.description).toBe('A great post')
    expect(result.content).toContain('# My Post')
    expect(result.content).toContain('Content here...')
    expect(result.content).not.toContain('---')
  })

  it('should remove JSX components from content', () => {
    const filePath = path.join(tempDir, 'test.mdx')
    const content = `# My Post

<Component prop="value">
  Some JSX content
</Component>

Regular markdown content here.`

    fs.writeFileSync(filePath, content, 'utf-8')
    const result = processMDXFile(filePath)

    expect(result.content).not.toContain('<Component')
    expect(result.content).not.toContain('Some JSX content')
    expect(result.content).toContain('Regular markdown content here')
  })

  it('should remove import statements', () => {
    const filePath = path.join(tempDir, 'test.mdx')
    const content = `import { Component } from './components';

# My Post

Content here.`

    fs.writeFileSync(filePath, content, 'utf-8')
    const result = processMDXFile(filePath)

    expect(result.content).not.toContain('import')
    expect(result.content).toContain('# My Post')
  })

  it('should preserve JSX and imports inside fenced code blocks', () => {
    const filePath = path.join(tempDir, 'test.mdx')
    const content = `export const metadata = {
  title: 'Guide',
};

# Guide

\`\`\`jsx
import { Button } from "ui";

export default () => <Button>Click</Button>;
\`\`\`

<Component prop="value">
  Some JSX content
</Component>

Regular markdown content here.`

    fs.writeFileSync(filePath, content, 'utf-8')
    const result = processMDXFile(filePath)

    expect(result.content).toContain('import { Button } from "ui";')
    expect(result.content).toContain('<Button>Click</Button>')
    expect(result.content).not.toContain('<Component')
    expect(result.content).toContain('Regular markdown content here')
  })

  it('should preserve fenced code blocks using tildes and long fences', () => {
    const filePath = path.join(tempDir, 'test.mdx')
    const content = `# Guide

~~~jsx
import { Tilde } from "ui";
~~~

\`\`\`\`mdx
import { Long } from "ui";
\`\`\`\`

Done.`

    fs.writeFileSync(filePath, content, 'utf-8')
    const result = processMDXFile(filePath)

    expect(result.content).toContain('import { Tilde } from "ui";')
    expect(result.content).toContain('import { Long } from "ui";')
  })

  it('should not delete a fenced code block wrapped by a JSX component pair', () => {
    const filePath = path.join(tempDir, 'test.mdx')
    const content = `<Wrapper>
\`\`\`jsx
import { Button } from "ui";
\`\`\`
</Wrapper>`

    fs.writeFileSync(filePath, content, 'utf-8')
    const result = processMDXFile(filePath)

    expect(result.content).toContain('import { Button } from "ui";')
  })
})

describe('processMDFile', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'get-llms-txt-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('should process MD file with frontmatter', () => {
    const filePath = path.join(tempDir, 'test.md')
    const content = `---
title: My Post
description: A great post
---

# My Post

Content here...`

    fs.writeFileSync(filePath, content, 'utf-8')
    const result = processMDFile(filePath)

    expect(result.metadata.title).toBe('My Post')
    expect(result.metadata.description).toBe('A great post')
    expect(result.content).toContain('# My Post')
    expect(result.content).not.toContain('---')
  })

  it('should process MD file without frontmatter', () => {
    const filePath = path.join(tempDir, 'test.md')
    const content = `# My Post

Content here...`

    fs.writeFileSync(filePath, content, 'utf-8')
    const result = processMDFile(filePath)

    expect(result.metadata).toEqual({})
    expect(result.content).toContain('# My Post')
  })
})

describe('discoverFiles', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'get-llms-txt-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('should write a root index.md to index.md instead of ..md', async () => {
    const contentDir = path.join(tempDir, 'content')
    const outputDir = path.join(tempDir, 'out')
    fs.mkdirSync(path.join(contentDir, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(contentDir, 'index.md'), '# Home\n\nWelcome to the site.', 'utf-8')
    fs.writeFileSync(path.join(contentDir, 'docs', 'index.md'), '# Docs\n\nDocs home.', 'utf-8')

    const files = await discoverFiles(contentDir, outputDir)

    const rootFile = files.find((file) => file.relativePath === 'index.md')
    expect(rootFile?.url).toBe('/md/index.md')
    expect(fs.existsSync(path.join(outputDir, 'md', 'index.md'))).toBe(true)
    expect(fs.existsSync(path.join(outputDir, 'md', '..md'))).toBe(false)

    // Nested index files keep mapping to their directory name
    const docsFile = files.find((file) => file.relativePath === path.join('docs', 'index.md'))
    expect(docsFile?.url).toBe('/md/docs/docs.md')
  })
})

describe('generateLLMsTxt', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'get-llms-txt-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('should generate llms.txt file with correct structure', () => {
    const files = [
      {
        relativePath: 'blog/post1.mdx',
        url: '/md/blog/post1.md',
        title: 'Post 1',
        description: 'First post',
        category: 'blog',
      },
      {
        relativePath: 'apps/app1.mdx',
        url: '/md/apps/app1.md',
        title: 'App 1',
        description: 'First app',
        category: 'apps',
      },
    ]

    generateLLMsTxt(files, tempDir, {
      projectName: 'Test Project',
      projectDescription: 'Test description',
      baseUrl: 'https://example.com',
    })

    const outputPath = path.join(tempDir, 'llms.txt')
    expect(fs.existsSync(outputPath)).toBe(true)

    const content = fs.readFileSync(outputPath, 'utf-8')
    expect(content).toContain('# Test Project')
    expect(content).toContain('> Test description')
    expect(content).toContain('[Post 1](https://example.com/md/blog/post1.md)')
    expect(content).toContain('[App 1](https://example.com/md/apps/app1.md)')
  })

  it('should group files by category', () => {
    const files = [
      {
        relativePath: 'blog/post1.mdx',
        url: '/md/blog/post1.md',
        title: 'Post 1',
        description: 'First post',
        category: 'blog',
      },
      {
        relativePath: 'blog/post2.mdx',
        url: '/md/blog/post2.md',
        title: 'Post 2',
        description: 'Second post',
        category: 'blog',
      },
      {
        relativePath: 'apps/app1.mdx',
        url: '/md/apps/app1.md',
        title: 'App 1',
        description: 'First app',
        category: 'apps',
      },
    ]

    generateLLMsTxt(files, tempDir, {
      projectName: 'Test Project',
    })

    const outputPath = path.join(tempDir, 'llms.txt')
    const content = fs.readFileSync(outputPath, 'utf-8')

    // Check that categories are separated
    const blogIndex = content.indexOf('## Blog')
    const appsIndex = content.indexOf('## Apps')
    expect(blogIndex).toBeGreaterThan(-1)
    expect(appsIndex).toBeGreaterThan(blogIndex)
  })

  it('should sort files by title within categories', () => {
    const files = [
      {
        relativePath: 'blog/zebra.mdx',
        url: '/md/blog/zebra.md',
        title: 'Zebra Post',
        category: 'blog',
      },
      {
        relativePath: 'blog/apple.mdx',
        url: '/md/blog/apple.md',
        title: 'Apple Post',
        category: 'blog',
      },
    ]

    generateLLMsTxt(files, tempDir, {
      projectName: 'Test Project',
    })

    const outputPath = path.join(tempDir, 'llms.txt')
    const content = fs.readFileSync(outputPath, 'utf-8')

    const appleIndex = content.indexOf('Apple Post')
    const zebraIndex = content.indexOf('Zebra Post')
    expect(appleIndex).toBeLessThan(zebraIndex)
  })
})
