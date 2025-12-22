# Easy Scraper API

An AI-powered web scraper API that automatically extracts structured data from any webpage using your custom llm-scraper tool. The API intelligently detects page navigation patterns and handles edge cases like infinite scroll, pagination, and load more buttons.

### API Endpoints

#### POST /api/scrape

Scrape a webpage and extract structured data.

**Request Body:**
```json
{
  "url": "https://example.com",
  "scraping_instructions": "Extract product information including name, price, and description",
  "max_pages": 10,
  "wait_time": 2000,
  "scroll_attempts": 3,
  "token_limit": 50000
}
```

**Parameters:**
- `url` (required): The webpage URL to scrape
- `scraping_instructions` (optional): Custom instructions for the scraper
- `max_pages` (optional): Maximum number of pages to scrape (default: 10)
- `wait_time` (optional): Wait time between actions in milliseconds (default: 2000)
- `scroll_attempts` (optional): Number of scroll attempts for infinite scroll (default: 3)
- `token_limit` (optional): Maximum tokens for LLM processing (default: 50000)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "title": "Product Name",
      "price": "$99.99",
      "description": "Product description...",
      "url": "https://example.com/product"
    }
  ],
  "metadata": {
    "url": "https://example.com",
    "pages_scraped": 1,
    "total_items": 5,
    "processing_time_ms": 5000
  }
}
```

#### GET /api/health

Health check endpoint.

#### GET /api/info

Get API information and documentation.

### Example Usage

```bash
# Scrape a simple webpage
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://news.ycombinator.com",
    "scraping_instructions": "Extract the top 5 news stories with their titles, points, and authors"
  }'

# Scrape with pagination
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/products",
    "scraping_instructions": "Extract all product information from all pages",
    "max_pages": 5
  }'
```

## Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
# OpenAI API Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Server Configuration
PORT=3000
NODE_ENV=development
```

## License

MIT License - see LICENSE file for details
# crawl
