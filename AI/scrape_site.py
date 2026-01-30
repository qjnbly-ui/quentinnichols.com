import os
from pathlib import Path
from bs4 import BeautifulSoup
from urllib.parse import quote

BASE_URL = "https://www.quentinnichols.com"
OUTPUT_DIR = "AI/site_text_data"

SKIP_DIRS = {".git", ".vscode", "node_modules", "AI"}


def extract_page_content(soup, url):
    title = soup.title.string.strip() if soup.title else "Untitled"

    main_content = (
        soup.find("main") or
        soup.find("article") or
        soup.find("div", class_="content") or
        soup.body
    )

    if not main_content:
        return None

    date_elem = (
        soup.find("time")
        or soup.find("div", class_="date")
        or soup.find("span", class_="published")
        or soup.find("span", class_="post-kicker-date")
    )
    date = date_elem.get_text(strip=True) if date_elem else "No date found"

    for elem in main_content.find_all(["script", "style", "nav", "footer", "header"]):
        elem.decompose()

    text_parts = []
    for elem in main_content.find_all(["h1", "h2", "h3", "p", "li"]):
        text = elem.get_text(strip=True)
        if text:
            text_parts.append(text)

    return {
        "title": title,
        "date": date,
        "body": "\n\n".join(text_parts),
        "url": url
    }


def url_to_filename(url: str) -> str:
    path = url.replace(BASE_URL, "").strip("/")
    if not path:
        return "homepage.md"
    safe = path.replace("/", "-")
    return f"{safe}.md"


def save_to_md(content):
    if not content:
        return
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    filename = url_to_filename(content["url"])
    filepath = os.path.join(OUTPUT_DIR, filename)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(f"# {content['title']}\n")
        f.write(f"Date: {content['date']}\n")
        f.write(f"URL: {content['url']}\n\n")
        f.write(content["body"])

    print(f"Saved: {filename}")


def file_path_to_url(path: Path) -> str:
    rel = path.relative_to(Path(".")).as_posix()
    if rel == "index.html":
        url_path = "/"
    else:
        url_path = "/" + rel
        if url_path.endswith("/index.html"):
            url_path = url_path[:-len("index.html")]
    return BASE_URL + quote(url_path)


def scrape_local_site():
    html_files = []
    for path in Path(".").rglob("index.html"):
        if any(part in SKIP_DIRS or part.startswith(".") for part in path.parts):
            continue
        html_files.append(path)

    for path in sorted(html_files):
        html = path.read_text(encoding="utf-8", errors="ignore")
        soup = BeautifulSoup(html, "html.parser")
        url = file_path_to_url(path)
        content = extract_page_content(soup, url)
        save_to_md(content)


if __name__ == "__main__":
    scrape_local_site()
    print(f"All text data organized in '{OUTPUT_DIR}' folder.")
