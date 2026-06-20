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
- `MAX_ITEMS_PER_SOURCE`: Default is `4`.
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

Supported API city codes are `gurugram` and `faridabad`. The script reads the headline, description, article page text, and URL before deciding whether to post. It only sends positive real-estate, infrastructure, development, launch, investment, and project-promotion news for the target cities.

City handling:

- Gurugram, Gurgaon, Sohna, Pataudi/Patodi, Manesar/Manasar, Dwarka Expressway, Golf Course Road -> `gurugram`
- Faridabad, Greater Faridabad, Neharpar -> `faridabad`
- Articles must contain clear Gurugram/Faridabad evidence. Generic Delhi NCR news is skipped unless the target cities are explicitly detected.
- RERA, court, legal, complaint, fraud, crime, death, murder, suicide, protest, delay, stalled-project, buyer-distress, demolition, penalty, and other negative/defaming stories are skipped even if they mention real estate.
- Any outside-city evidence in the headline, description, full article text, or URL is treated as a hard reject.

If it cannot detect positive real-estate relevance and a target city, the article is skipped. If it is real-estate-related but cannot detect a target city, it is skipped unless `ALLOW_DEFAULT_CITY_CODE` is set to `true`.

## Default sources

- `https://www.hindustantimes.com/real-estate`
- `https://www.hindustantimes.com/cities/gurugram-news`
- `https://www.hindustantimes.com/topic/faridabad/news`
- `https://www.cnbctv18.com/real-estate/`
- `https://realty.economictimes.indiatimes.com/`
- `https://www.moneycontrol.com/news/business/real-estate/`
- `https://www.business-standard.com/topic/real-estate`
- `https://www.outlookmoney.com/topic/real-estate`
- `https://www.tribuneindia.com/topic/real-estate`
- `https://www.tribuneindia.com/news/haryana`
- `https://timesofindia.indiatimes.com/city/gurgaon`
- `https://timesofindia.indiatimes.com/city/faridabad`
- `https://indianexpress.com/section/cities/delhi/`
- `https://www.thehindu.com/news/cities/Delhi/`
- `https://torbitrealty.com/category/news/city-updates/gurugram/`
- `https://realtynmore.com/latest-news/`
- `https://realtynxt.com/`
- `https://www.track2realty.track2media.com/`
- `https://propnewstime.com/`
- `https://www.constructionworld.in/`
- `https://housing.com/news/`
- `https://content.magicbricks.com/`
- `https://www.99acres.com/articles/`
- `https://www.squareyards.com/blog`
