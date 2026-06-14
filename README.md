# News API Pusher

Fetches real estate and business news every 10 minutes with GitHub Actions, removes duplicates, and sends only new articles to your PropertyMaster API.

## How it works

- GitHub Actions runs `.github/workflows/news-pusher.yml` every 10 minutes.
- The script reads sources from `NEWS_SOURCES`.
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
- `NEWS_SOURCES`: Comma-separated RSS feed URLs or category/news page URLs.

Optional repository variable:

- `MAX_ITEMS_PER_RUN`: Default is `30`.
- `MAX_ITEMS_PER_SOURCE`: Default is `10`.
- `DEFAULT_CITY_CODE`: Default is `gurugram`.
- `ALLOW_DEFAULT_CITY_CODE`: Default is `false`. Keep this false to skip articles where Gurugram/Faridabad cannot be detected.

The workflow is already scheduled for every 10 minutes:

```yaml
- cron: "*/10 * * * *"
```

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

Supported API city codes are `gurugram` and `faridabad`. Greater Faridabad and Neharpar news is sent as `faridabad`; Sohna and Pataudi news is sent as `gurugram`. The script detects the city from the title, description, and link. If it cannot detect a target city, the article is skipped unless `ALLOW_DEFAULT_CITY_CODE` is set to `true`.

## Default sources

- `https://www.hindustantimes.com/real-estate`
- `https://www.aninews.in/category/business/`
- `https://www.cnbctv18.com/real-estate/`
- `https://www.moneycontrol.com/news/business/`
- `https://www.business-standard.com/search?q=REAL%20ESTATE`
- `https://www.outlookmoney.com/topic/real-estate`
- `https://www.tribuneindia.com/topic/real-estate`
- `https://torbitrealty.com/category/news/city-updates/gurugram/`
- `https://realtynmore.com/latest-news/`
- `https://www.hindustantimes.com/topic/faridabad/news`
- `https://www.lokmattimes.com/business/`
- `https://propnewstime.com/`
