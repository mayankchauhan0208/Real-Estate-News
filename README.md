# News API Pusher

Fetches real estate and business news every 10 minutes with GitHub Actions, removes duplicates, and sends only new articles to your PropertyMaster API.

## How it works

- GitHub Actions runs `.github/workflows/news-pusher.yml` every 10 minutes.
- The script uses only the built-in strict source list. GitHub secrets cannot add broad/old source links.
- RSS feeds are parsed directly.
- Normal webpage/category pages are scraped for article links, then each article page is checked for description and thumbnail metadata.
- Each article gets a stable ID from its URL/title/source.
- Sent IDs are stored in `.state/sent-news.json`.
- GitHub Actions cache restores that state on the next run so repeated news is not sent again.
- New articles are sent to `APP_API_URL`.

## Local setup

```bash
npm install
copy .env.example .env
npm start
```

Edit `.env` with your real values before running locally.

## GitHub setup

Create a new GitHub repo for this folder, then add these repository secrets:

- `APP_API_URL`: Your app API endpoint. Use `https://api.propertymaster.com/api/news`.
- `APP_API_KEY`: Optional API key or token, only if your API starts requiring auth.
Optional repository variable:

- `MAX_ITEMS_PER_RUN`: Default is `30`.
- `MAX_ITEMS_PER_SOURCE`: Default is `200`.
- `MAX_PAGES_PER_SOURCE`: Default is `5` for supported paginated source pages.
- `EXTRA_ARTICLE_URLS`: Optional exact article URLs, separated by comma, semicolon, or newline. Use only for manually found articles; each URL still has to pass the strict full-article filters.

The workflow is already scheduled for every 10 minutes:

```yaml
- cron: "*/10 * * * *"
```

Push-triggered runs are disabled. Manual runs are allowed. To rerun a date window without reposting already-sent articles, start the workflow manually and set:

- `backfill_from`: `2026-06-30`
- `backfill_to`: `2026-07-13`
- `max_items_per_source`: `200` or higher
- `max_pages_per_source`: `5`
- `max_items_per_run`: `80` or higher
- `resend_backfill`: keep unchecked
- `skip_titles`: optional exact titles to skip, separated by `||`
- `extra_article_urls`: optional exact URLs for clean manually found articles that the approved source list missed

If you deleted old API news and need to recreate the same date window, use the same backfill dates and set `resend_backfill` to checked. This bypasses the sent-news dedupe only for that dated manual run.

For the June 25 cleanup run, use:

- `backfill_from`: `2026-06-25`
- `backfill_to`: `2026-07-13`
- `max_items_per_source`: `200`
- `max_pages_per_source`: `5`
- `max_items_per_run`: `120`
- `resend_backfill`: checked
- `skip_titles`: any already-restored titles separated by `||`
- `extra_article_urls`: optional exact URLs for clean manually found articles that the approved source list missed

The backfill still uses the same strict positive real-estate filters.

## API payload

The script sends one POST per article:

```json
{
  "title": "News title",
  "description": "Full news description from RSS",
  "cityCode": "gurugram",
  "isActive": true,
  "newsLink": "https://source.example/article",
  "thumbnailImage": "https://source.example/image.jpg",
  "postedBy": "Times of India",
  "createdAt": "2026-06-14T06:50:00.000Z",
  "postedByLogo": "https://source.example/logo.png"
}
```

If `APP_API_KEY` is provided, the script also sends:

```http
Authorization: Bearer YOUR_APP_API_KEY
```

Supported API city codes are `gurugram` and `faridabad`. The script reads the headline, description, article page text, and URL before deciding whether to post. It only sends positive real-estate, infrastructure, development, launch, investment, and project-promotion news for the target cities.

City handling:

- Gurugram, Gurgaon, Sohna, Pataudi/Patodi, Manesar/Manasar, Dwarka Expressway, Golf Course Road -> `gurugram`
- Faridabad, Greater Faridabad, Neharpar -> `faridabad`
- Exact Delhi NCR articles go to both `gurugram` and `faridabad`. Plain NCR without Delhi, or any outside-city/state evidence, is rejected.
- RERA, court, legal, complaint, fraud, crime, death, murder, suicide, protest, delay, stalled-project, buyer-distress, demolition, penalty, and other negative/defaming stories are skipped even if they mention real estate.
- Any outside-city evidence in the headline, description, full article text, or URL is treated as a hard reject.

If it cannot detect positive real-estate relevance and a target city, the article is skipped. There is no default city fallback.

## Default sources

Default sources are always used. Broad old source injection is disabled, so `NEWS_SOURCES` is ignored even if it still exists as a GitHub secret.

- `https://www.hindustantimes.com/real-estate`
- `https://www.hindustantimes.com/topic/faridabad/news`
- `https://www.cnbctv18.com/real-estate/`
- `https://realty.economictimes.indiatimes.com/tag/gurugram`
- `https://realty.economictimes.indiatimes.com/tag/faridabad`
- `https://www.moneycontrol.com/news/business/real-estate/`
- `https://www.business-standard.com/topic/real-estate`
- `https://www.outlookmoney.com/topic/real-estate`
- `https://www.tribuneindia.com/topic/real-estate`
- `https://torbitrealty.com/category/news/city-updates/gurugram/`
- `https://realtynmore.com/latest-news/`
- `https://realtynxt.com/`
- `https://www.track2realty.track2media.com/`
- `https://propnewstime.com/`
