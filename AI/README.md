# AI Utilities

## Website Text Scraper

`scrape_site.py` crawls `https://www.quentinnichols.com`, follows internal links
(including `/blog/private/`), and saves page text to Markdown files.

### Run

```bash
python3 AI/scrape_site.py
```

### Output

Files are written to:

```
AI/site_text_data/
```
