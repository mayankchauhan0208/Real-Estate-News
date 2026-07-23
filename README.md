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

- `MAX_ITEMS_PER_RUN`: Default is `80`.
- `MAX_ITEMS_PER_SOURCE`: Default is `300`.
- `MAX_PAGES_PER_SOURCE`: Default is `15` for supported paginated source pages.
- `DEFAULT_LOOKBACK_DAYS`: Default is `20` when no manual backfill date range is supplied.
- `DRY_RUN`: Set to `true` only for local audits. It prints publish candidates without calling the API or updating sent-news state.
- `ENABLE_NOIDA_CITY`: Set to `true` only for local Noida preparation. Noida API posting is blocked unless `ALLOW_NOIDA_API=true` is added later.
- `TARGET_CITY_CODES`: Optional comma-separated city filter, e.g. `noida` for a Noida-only dry run.
- `EXTRA_ARTICLE_URLS`: Optional exact article URLs, separated by comma, semicolon, or newline. Use only for manually found articles; each URL still has to pass the strict full-article filters.

The workflow is already scheduled for every 10 minutes:

```yaml
- cron: "*/10 * * * *"
```

Push-triggered runs are disabled. Manual runs are allowed. To rerun a date window without reposting already-sent articles, start the workflow manually and set:

- `backfill_from`: `2026-06-30`
- `backfill_to`: `2026-07-13`
- `max_items_per_source`: `300` or higher
- `max_pages_per_source`: `15`
- `max_items_per_run`: `80` or higher
- `resend_backfill`: keep unchecked
- `skip_titles`: optional exact titles to skip, separated by `||`
- `extra_article_urls`: optional exact URLs for clean manually found articles that the approved source list missed

If you deleted old API news and need to recreate the same date window, use the same backfill dates and set `resend_backfill` to checked. This bypasses the sent-news dedupe only for that dated manual run.

For a local Noida-only dry run, do not send to the API. Use:

```powershell
$env:ENABLE_NOIDA_CITY='true'
$env:DRY_RUN='true'
$env:TARGET_CITY_CODES='noida'
$env:BACKFILL_FROM='2026-06-23'
$env:BACKFILL_TO='2026-07-23'
npm.cmd start
```

For the June 25 cleanup run, use:

- `backfill_from`: `2026-06-25`
- `backfill_to`: `2026-07-13`
- `max_items_per_source`: `300`
- `max_pages_per_source`: `15`
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
- `https://economictimes.indiatimes.com/industry/services/property-/-cstruction`
- `https://economictimes.indiatimes.com/news/company/corporate-trends`
- `https://www.cnbctv18.com/real-estate/`
- `https://timesofindia.indiatimes.com/real-estate/news`
- `https://realty.economictimes.indiatimes.com/tag/gurugram`
- `https://realty.economictimes.indiatimes.com/tag/faridabad`
- `https://realty.economictimes.indiatimes.com/news/residential`
- `https://realty.economictimes.indiatimes.com/news/commercial`
- `https://realty.economictimes.indiatimes.com/news/infrastructure`
- `https://realty.economictimes.indiatimes.com/news/industry`
- `https://www.moneycontrol.com/news/business/real-estate/`
- `https://www.constructionworld.in/latest-construction-news/real-estate-news`
- `https://www.outlookmoney.com/topic/real-estate`
- `https://www.tribuneindia.com/topic/real-estate`
- `https://torbitrealty.com/category/news/city-updates/gurugram/`
- `https://indianinfrastructure.com/`
- `https://urbantransportnews.com/`
- `https://www.metrorailnews.in/`
- `https://themetrorailguy.com/`
- `https://news.railanalysis.com/`
- `https://www.delhimetrorail.com/`
- `https://ncrtc.in/`
- `https://realtynmore.com/latest-news/`
- `https://realtynxt.com/`
- `https://www.track2realty.track2media.com/`
- `https://propnewstime.com/`
- `https://hsvphry.org.in/`
- `https://www.bptp.com/media`
- `https://www.dlf.in/media`
- `https://m3mindia.com/media`
- `https://smartworlddevelopers.com/media`
- `https://www.signatureglobal.in/`
- `https://www.centralpark.in/media.php`
- `https://www.godrejproperties.com/media/press`
- `https://www.emaarindia.com/media/`
- `https://www.whitelandcorporation.com/`
- `https://maxestates.in/news_and_media`
- `https://www.birlaestates.com/media-centre.aspx`
- `https://www.puriconstructions.com/`
- `https://www.omaxe.com/`
- `https://www.rpsgroupindia.com/`

Noida sources are opt-in only when `ENABLE_NOIDA_CITY=true`:

- `https://realty.economictimes.indiatimes.com/tag/noida`
- `https://realty.economictimes.indiatimes.com/tag/greater%2Bnoida`
- `https://realty.economictimes.indiatimes.com/amp/tag/greater%2Bnoida`
- `https://realty.economictimes.indiatimes.com/tag/jewar`
- `https://realty.economictimes.indiatimes.com/tag/yamuna%2Bexpressway`
- `https://realty.economictimes.indiatimes.com/tag/noida%2Bairport`
- `https://realty.economictimes.indiatimes.com/tag/noida%2Bauthority`
- `https://realty.economictimes.indiatimes.com/tag/greater%2Bnoida%2Bauthority`
- `https://realty.economictimes.indiatimes.com/tag/yeida`
- `https://realty.economictimes.indiatimes.com/rss/residential`
- `https://realty.economictimes.indiatimes.com/rss/commercial`
- `https://realty.economictimes.indiatimes.com/rss/infrastructure`
- `https://realty.economictimes.indiatimes.com/rss/industry`
- `https://realty.economictimes.indiatimes.com/rss/regulatory`
- `https://www.hindustantimes.com/cities/noida-news`
- `https://www.hindustantimes.com/topic/noida/news`
- `https://www.hindustantimes.com/topic/greater-noida/news`
- `https://www.hindustantimes.com/topic/noida-authority/news`
- `https://www.hindustantimes.com/topic/greater-noida-authority/news`
- `https://www.hindustantimes.com/topic/yamuna-expressway/news`
- `https://www.hindustantimes.com/topic/jewar-airport/news`
- `https://www.hindustantimes.com/topic/yeida/news`
- `https://economictimes.indiatimes.com/industry/services/property-/-cstruction`
- `https://www.moneycontrol.com/news/business/real-estate/`
- `https://www.cnbctv18.com/real-estate/`
- `https://timesofindia.indiatimes.com/real-estate/news`
- `https://www.constructionworld.in/latest-construction-news/real-estate-news`
- `https://realtynmore.com/latest-news/`
- `https://realtynxt.com/`
- `https://propnewstime.com/`
- `https://www.track2realty.track2media.com/`
- `https://www.niairport.in/en/company/news/overview/news-overview`
- `https://www.yamunaexpresswayauthority.com/web/`
- `https://www.yamunaexpresswayauthority.com/web/announcement/`
- `https://gnida.up.gov.in/en/news`
- `https://gnida.up.gov.in/en/announcements`
- `https://www.atsgreens.com/blog`
- `https://www.mahagunindia.com/media`
- `https://countygroup.in/`
- `https://www.prateekgroup.com/blog`
- `https://www.gulshangroup.com/`
- `https://www.aba-corp.com/`
- `https://indianexpress.com/about/noida-authority/`
- `https://indianexpress.com/about/greater-noida-authority/`
- `https://timesofindia.indiatimes.com/city/noida`
