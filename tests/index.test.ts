import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  extractMetadataValues,
  extractTitle,
  extractDescription,
  processMDXFile,
  processMDFile,
  generateLLMsTxt,
} from '../src/index.js';

describe('extractMetadataValues', () => {
  it('should extract title from metadata string', () => {
    const metadataStr = `{ title: 'My Post', description: 'A great post' }`;
    const result = extractMetadataValues(metadataStr);
    expect(result.title).toBe('My Post');
    expect(result.description).toBe('A great post');
  });

  it('should extract tags array from metadata string', () => {
    const metadataStr = `{ title: 'My Post', tags: ['blog', 'tech', 'nextjs'] }`;
    const result = extractMetadataValues(metadataStr);
    expect(result.tags).toEqual(['blog', 'tech', 'nextjs']);
  });

  it('should handle empty metadata string', () => {
    const result = extractMetadataValues('{}');
    expect(result).toEqual({});
  });
});

describe('extractTitle', () => {
  it('should extract title from metadata', () => {
    const metadata = {title: 'My Post'};
    const content = '# Different Title';
    const filePath = '/test/file.mdx';
    const result = extractTitle(filePath, metadata, content);
    expect(result).toBe('My Post');
  });

  it('should extract title from first H1 if no metadata', () => {
    const metadata = {};
    const content = '# My Post Title\n\nContent here';
    const filePath = '/test/file.mdx';
    const result = extractTitle(filePath, metadata, content);
    expect(result).toBe('My Post Title');
  });

  it('should fallback to filename if no title or H1', () => {
    const metadata = {};
    const content = 'Just some content without a title';
    const filePath = '/test/my-awesome-post.mdx';
    const result = extractTitle(filePath, metadata, content);
    expect(result).toBe('My Awesome Post');
  });
});

describe('extractDescription', () => {
  it('should extract description from metadata', () => {
    const metadata = {description: 'A great post about Next.js'};
    const content = 'Different content here';
    const result = extractDescription(metadata, content);
    expect(result).toBe('A great post about Next.js');
  });

  it('should extract first paragraph if no metadata description', () => {
    const metadata = {};
    const content =
      'This is a long paragraph that should be extracted as the description because it is more than 50 characters long and contains useful information.';
    const result = extractDescription(metadata, content);
    expect(result).toBeTruthy();
    expect(result?.length).toBeLessThanOrEqual(200);
  });

  it('should return undefined if no description available', () => {
    const metadata = {};
    const content = '# Title\n\nShort';
    const result = extractDescription(metadata, content);
    expect(result).toBeUndefined();
  });
});

describe('processMDXFile', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-llms-txt-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, {recursive: true, force: true});
  });

  it('should process MDX file with export const metadata', () => {
    const filePath = path.join(tempDir, 'test.mdx');
    const content = `export const metadata = {
      title: 'My Post',
      description: 'A great post',
      tags: ['blog', 'tech'],
    };

# My Post

Content here...`;

    fs.writeFileSync(filePath, content, 'utf-8');
    const result = processMDXFile(filePath);

    expect(result.metadata.title).toBe('My Post');
    expect(result.metadata.description).toBe('A great post');
    expect(result.metadata.tags).toEqual(['blog', 'tech']);
    expect(result.content).toContain('# My Post');
    expect(result.content).toContain('Content here...');
    expect(result.content).not.toContain('export const metadata');
  });

  it('should process MDX file with YAML frontmatter', () => {
    const filePath = path.join(tempDir, 'test.mdx');
    const content = `---
title: My Post
description: A great post
tags: [blog, tech]
---

# My Post

Content here...`;

    fs.writeFileSync(filePath, content, 'utf-8');
    const result = processMDXFile(filePath);

    expect(result.metadata.title).toBe('My Post');
    expect(result.metadata.description).toBe('A great post');
    expect(result.content).toContain('# My Post');
    expect(result.content).toContain('Content here...');
    expect(result.content).not.toContain('---');
  });

  it('should remove JSX components from content', () => {
    const filePath = path.join(tempDir, 'test.mdx');
    const content = `# My Post

<Component prop="value">
  Some JSX content
</Component>

Regular markdown content here.`;

    fs.writeFileSync(filePath, content, 'utf-8');
    const result = processMDXFile(filePath);

    expect(result.content).not.toContain('<Component');
    expect(result.content).not.toContain('Some JSX content');
    expect(result.content).toContain('Regular markdown content here');
  });

  it('should remove import statements', () => {
    const filePath = path.join(tempDir, 'test.mdx');
    const content = `import { Component } from './components';

# My Post

Content here.`;

    fs.writeFileSync(filePath, content, 'utf-8');
    const result = processMDXFile(filePath);

    expect(result.content).not.toContain('import');
    expect(result.content).toContain('# My Post');
  });
});

describe('processMDFile', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-llms-txt-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, {recursive: true, force: true});
  });

  it('should process MD file with frontmatter', () => {
    const filePath = path.join(tempDir, 'test.md');
    const content = `---
title: My Post
description: A great post
---

# My Post

Content here...`;

    fs.writeFileSync(filePath, content, 'utf-8');
    const result = processMDFile(filePath);

    expect(result.metadata.title).toBe('My Post');
    expect(result.metadata.description).toBe('A great post');
    expect(result.content).toContain('# My Post');
    expect(result.content).not.toContain('---');
  });

  it('should process MD file without frontmatter', () => {
    const filePath = path.join(tempDir, 'test.md');
    const content = `# My Post

Content here...`;

    fs.writeFileSync(filePath, content, 'utf-8');
    const result = processMDFile(filePath);

    expect(result.metadata).toEqual({});
    expect(result.content).toContain('# My Post');
  });
});

describe('generateLLMsTxt', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-llms-txt-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, {recursive: true, force: true});
  });

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
    ];

    generateLLMsTxt(files, tempDir, {
      projectName: 'Test Project',
      projectDescription: 'Test description',
      baseUrl: 'https://example.com',
    });

    const outputPath = path.join(tempDir, 'llms.txt');
    expect(fs.existsSync(outputPath)).toBe(true);

    const content = fs.readFileSync(outputPath, 'utf-8');
    expect(content).toContain('# Test Project');
    expect(content).toContain('> Test description');
    expect(content).toContain('[Post 1](https://example.com/md/blog/post1.md)');
    expect(content).toContain('[App 1](https://example.com/md/apps/app1.md)');
  });

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
    ];

    generateLLMsTxt(files, tempDir, {
      projectName: 'Test Project',
    });

    const outputPath = path.join(tempDir, 'llms.txt');
    const content = fs.readFileSync(outputPath, 'utf-8');

    // Check that categories are separated
    const blogIndex = content.indexOf('## Blog');
    const appsIndex = content.indexOf('## Apps');
    expect(blogIndex).toBeGreaterThan(-1);
    expect(appsIndex).toBeGreaterThan(blogIndex);
  });

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
    ];

    generateLLMsTxt(files, tempDir, {
      projectName: 'Test Project',
    });

    const outputPath = path.join(tempDir, 'llms.txt');
    const content = fs.readFileSync(outputPath, 'utf-8');

    const appleIndex = content.indexOf('Apple Post');
    const zebraIndex = content.indexOf('Zebra Post');
    expect(appleIndex).toBeLessThan(zebraIndex);
  });
});
