#!/usr/bin/env python3
"""
llms-txt-audit — Audit and generate llms.txt for any website.

Usage:
    python audit_llms_txt.py --url https://example.com [--generate] [--output ./llms.txt] [--max-pages 50] [--check-freshness-days 30]
"""

import argparse
import asyncio
import json
import sys
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from markdownify import markdownify as md


@dataclass
class LLMSAuditResult:
    url: str
    llms_txt: dict
    crawl: dict
    generated: bool
    output_path: Optional[str]
    timestamp: str


async def fetch_head(client: httpx.AsyncClient, url: str) -> tuple[int, Optional[str], Optional[int]]:
    """Fetch HEAD request, return (status, last_modified, content_length)."""
    try:
        resp = await client.head(url, follow_redirects=True, timeout=10.0)
        return resp.status_code, resp.headers.get("last-modified"), int(resp.headers.get("content-length", 0) or 0)
    except Exception:
        return 0, None, 0


async def fetch_get(client: httpx.AsyncClient, url: str) -> tuple[int, str]:
    """Fetch GET request, return (status, text)."""
    try:
        resp = await client.get(url, follow_redirects=True, timeout=10.0)
        return resp.status_code, resp.text
    except Exception:
        return 0, ""


async def discover_llms_txt(client: httpx.AsyncClient, base_url: str) -> dict:
    """Check standard locations for llms.txt."""
    locations = [
        urljoin(base_url, "/llms.txt"),
        urljoin(base_url, "/.well-known/llms.txt"),
    ]
    for loc in locations:
        status, last_mod, size = await fetch_head(client, loc)
        if status == 200:
            _, content = await fetch_get(client, loc)
            return {
                "found": True,
                "location": loc,
                "status": status,
                "last_modified": last_mod,
                "size_bytes": size,
                "content": content,
            }
    return {"found": False, "location": None, "status": 404, "last_modified": None, "size_bytes": 0, "content": ""}


def validate_llms_txt(content: str) -> dict:
    """Validate llms.txt structure per spec."""
    lines = [l.rstrip() for l in content.splitlines() if l.strip()]
    if not lines:
        return {"has_h1": False, "has_description": False, "has_sections": False, "links_reachable": 0, "links_broken": 0, "total_links": 0}

    has_h1 = any(l.startswith("# ") for l in lines)
    has_description = False
    has_sections = False
    links = []

    in_section = False
    for i, line in enumerate(lines):
        if line.startswith("## "):
            has_sections = True
            in_section = True
        elif in_section and line.startswith("- [") and "](" in line:
            # Extract URL from markdown link
            try:
                url = line.split("](")[1].split(")")[0]
                links.append(url)
            except Exception:
                pass
        elif not line.startswith("#") and not has_description and i > 0:
            has_description = True

    return {
        "has_h1": has_h1,
        "has_description": has_description,
        "has_sections": has_sections,
        "total_links": len(links),
        "links_reachable": 0,  # Will be filled after HEAD checks
        "links_broken": 0,
    }


async def validate_links(client: httpx.AsyncClient, urls: list[str]) -> tuple[int, int]:
    """Check reachability of links."""
    reachable = 0
    broken = 0
    for url in urls:
        status, _, _ = await fetch_head(client, url)
        if status == 200:
            reachable += 1
        else:
            broken += 1
    return reachable, broken


async def crawl_site(client: httpx.AsyncClient, base_url: str, max_pages: int) -> list[dict]:
    """BFS crawl same-domain pages, extract title, description, URL."""
    parsed_base = urlparse(base_url)
    base_domain = parsed_base.netloc
    visited = set()
    queue = [base_url]
    results = []

    robots_url = urljoin(base_url, "/robots.txt")
    _, robots_text = await fetch_get(client, robots_url)
    # Simple robots.txt parsing - just check for Disallow patterns
    disallowed_paths = []
    for line in robots_text.splitlines():
        if line.strip().startswith("Disallow:"):
            path = line.split(":", 1)[1].strip()
            if path and path != "/":
                disallowed_paths.append(path)

    def is_disallowed(url: str) -> bool:
        parsed = urlparse(url)
        for disallow in disallowed_paths:
            if parsed.path.startswith(disallow):
                return True
        return False

    skip_patterns = ["/api/", "/admin/", "/login/", "/cart/", "/checkout/", ".pdf", ".zip", ".exe", ".dmg", ".pkg"]

    while queue and len(results) < max_pages:
        url = queue.pop(0)
        if url in visited:
            continue
        visited.add(url)

        if is_disallowed(url):
            continue

        parsed = urlparse(url)
        if parsed.netloc != base_domain:
            continue
        if any(p in url for p in skip_patterns):
            continue

        status, html = await fetch_get(client, url)
        if status != 200 or not html:
            continue

        soup = BeautifulSoup(html, "lxml")

        # Extract title
        title_tag = soup.find("title")
        title = title_tag.get_text(strip=True) if title_tag else ""

        # Extract meta description
        meta_desc = soup.find("meta", attrs={"name": "description"})
        description = meta_desc.get("content", "").strip() if meta_desc else ""

        # Extract h1
        h1_tag = soup.find("h1")
        h1 = h1_tag.get_text(strip=True) if h1_tag else ""

        # Use best available for title/description
        page_title = title or h1 or url
        page_desc = description or (h1 if h1 != title else "") or ""

        # Priority heuristic
        priority = 0
        if url == base_url or url.rstrip("/") == base_url.rstrip("/"):
            priority = 100
        elif "/docs/" in url or "/documentation/" in url:
            priority = 80
        elif "/api/" in url:
            priority = 70
        elif "/guide" in url or "/tutorial" in url or "/learn/" in url:
            priority = 60
        elif "/blog/" in url or "/news/" in url or "/changelog" in url:
            priority = 40

        results.append({
            "url": url,
            "title": page_title[:200],
            "description": page_desc[:200],
            "priority": priority,
        })

        # Find more links
        for link in soup.find_all("a", href=True):
            href = link["href"]
            full_url = urljoin(url, href)
            parsed = urlparse(full_url)
            if parsed.netloc == base_domain and full_url not in visited:
                queue.append(full_url)

    # Sort by priority desc
    results.sort(key=lambda x: x["priority"], reverse=True)
    return results


def generate_llms_txt(site_name: str, pages: list[dict], base_url: str) -> str:
    """Generate llms.txt from crawled pages."""
    # Group pages by category
    core = []
    guides = []
    api = []
    blog = []
    other = []

    for p in pages:
        entry = f"- [{p['title']}]({p['url']}) — {p['description'] or 'See details'}"
        url_lower = p["url"].lower()
        if p["url"] == base_url or p["url"].rstrip("/") == base_url.rstrip("/"):
            core.insert(0, entry)  # Homepage first
        elif "/docs/" in url_lower or "/documentation/" in url_lower:
            core.append(entry)
        elif "/api/" in url_lower:
            api.append(entry)
        elif "/guide" in url_lower or "/tutorial" in url_lower or "/learn/" in url_lower:
            guides.append(entry)
        elif "/blog/" in url_lower or "/news/" in url_lower or "/changelog" in url_lower:
            blog.append(entry)
        else:
            other.append(entry)

    sections = []
    if core:
        sections.append("## Core Pages\n" + "\n".join(core[:10]))
    if api:
        sections.append("## API Reference\n" + "\n".join(api[:10]))
    if guides:
        sections.append("## Guides & Tutorials\n" + "\n".join(guides[:10]))
    if blog:
        sections.append("## Blog & Updates\n" + "\n".join(blog[:10]))
    if other:
        sections.append("## More\n" + "\n".join(other[:10]))

    content = f"# {site_name}\n\nOne-sentence description of what this site does for visitors.\n\n"
    content += "\n\n".join(sections)
    content += "\n\n<!-- Generated by llms-txt-audit skill — romankurnovskii.com/llms-txt-guide -->"
    return content


async def main():
    parser = argparse.ArgumentParser(description="Audit and generate llms.txt for any website")
    parser.add_argument("--url", required=True, help="Root URL of the site to audit")
    parser.add_argument("--max-pages", type=int, default=50, help="Max pages to crawl")
    parser.add_argument("--check-freshness-days", type=int, default=30, help="Flag as stale if older than N days")
    parser.add_argument("--generate", action="store_true", help="Generate llms.txt if missing or stale")
    parser.add_argument("--output", default="./llms.txt", help="Output path for generated file")
    parser.add_argument("--respect-robots", action="store_true", default=True, help="Respect robots.txt")
    args = parser.parse_args()

    base_url = args.url.rstrip("/")
    timestamp = datetime.now(timezone.utc).isoformat()

    async with httpx.AsyncClient(headers={"User-Agent": "llms-txt-audit/1.0"}) as client:
        # 1. Discover llms.txt
        llms_info = await discover_llms_txt(client, base_url)

        # 2. Validate if found
        validation = {"has_h1": False, "has_description": False, "has_sections": False, "links_reachable": 0, "links_broken": 0, "total_links": 0}
        fresh = True

        if llms_info["found"]:
            validation = validate_llms_txt(llms_info["content"])

            # Check link reachability
            if validation["total_links"] > 0:
                # Extract URLs from content for validation
                lines = llms_info["content"].splitlines()
                urls = []
                for line in lines:
                    if line.strip().startswith("- [") and "](" in line:
                        try:
                            url = line.split("](")[1].split(")")[0]
                            urls.append(url)
                        except Exception:
                            pass
                if urls:
                    reachable, broken = await validate_links(client, urls)
                    validation["links_reachable"] = reachable
                    validation["links_broken"] = broken

            # Check freshness
            if llms_info["last_modified"]:
                try:
                    last_mod = datetime.fromisoformat(llms_info["last_modified"].replace("Z", "+00:00"))
                    age_days = (datetime.now(timezone.utc) - last_mod).days
                    fresh = age_days <= args.check_freshness_days
                except Exception:
                    fresh = True

        # 3. Crawl for content (needed for generation or validation coverage)
        crawled = await crawl_site(client, base_url, args.max_pages)

        # 4. Generate if requested
        generated = False
        output_path = None
        if args.generate and (not llms_info["found"] or not fresh):
            site_name = urlparse(base_url).netloc.replace("www.", "").title()
            generated_content = generate_llms_txt(site_name, crawled, base_url)
            Path(args.output).write_text(generated_content, encoding="utf-8")
            generated = True
            output_path = args.output

        # 5. Build result
        result = LLMSAuditResult(
            url=base_url,
            llms_txt={
                "found": llms_info["found"],
                "location": llms_info["location"],
                "status": llms_info["status"],
                "last_modified": llms_info["last_modified"],
                "size_bytes": llms_info["size_bytes"],
                "valid": all([validation["has_h1"], validation["has_description"], validation["has_sections"]]),
                "fresh": fresh,
                "validation": validation,
            },
            crawl={
                "pages_crawled": len(crawled),
                "candidate_links": len(crawled),
                "selected_links": sum(1 for p in crawled if p["priority"] > 0),
            },
            generated=generated,
            output_path=output_path,
            timestamp=timestamp,
        )

        # Output JSON
        print(json.dumps(asdict(result), indent=2, ensure_ascii=False))

        # Also write audit report
        report_path = Path("audit_report.json")
        report_path.write_text(json.dumps(asdict(result), indent=2, ensure_ascii=False))

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))