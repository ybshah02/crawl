# Easy Scraper API

An AI-powered web scraper API that automatically extracts structured data from any webpage using your custom llm-scraper tool. The API intelligently detects page navigation patterns and handles edge cases like infinite scroll, pagination, and load more buttons.

## Features

- 🤖 **AI-Powered**: Uses LLMs to automatically generate schemas and extract data
- 🔍 **Smart Navigation**: Automatically detects and handles pagination, infinite scroll, and load more buttons
- 📝 **Markdown Conversion**: Converts HTML to markdown for better LLM processing
- 🎯 **Schema Generation**: Automatically generates Zod schemas based on page content
- ⚡ **Configurable**: Customizable scraping parameters and instructions
- 🛡️ **Robust**: Handles edge cases and provides detailed error reporting

## Architecture

The API follows this process:

1. **URL Input**: User provides a URL and optional scraping instructions
2. **Page Analysis**: Analyzes the page to detect navigation patterns
3. **Markdown Conversion**: Converts HTML to optimized markdown
4. **Schema Generation**: Uses LLM to generate appropriate Zod schema
5. **Data Extraction**: Uses llm-scraper to extract structured data
6. **Navigation Handling**: Automatically handles multiple pages if needed
7. **JSON Output**: Returns clean, structured data

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd easy-scraper-node-v2
```

2. Install dependencies:
```bash
npm install
```

3. Install Playwright browsers:
```bash
npx playwright install
```

4. Set up environment variables:
```bash
cp env.example .env
# Edit .env with your OpenAI API key
```

5. Build the project:
```bash
npm run build
```

## Usage

### Starting the Server

```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start
```

The server will start on `http://localhost:3000`

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

## Supported Navigation Patterns

### 1. Single Page
- Standard webpage with all content on one page
- No navigation required

### 2. Pagination
- Traditional page navigation with "Next" buttons
- Automatically detects and follows pagination links
- Configurable maximum page limit

### 3. Infinite Scroll
- Content loads as user scrolls down
- Automatically scrolls and waits for new content
- Configurable scroll attempts

### 4. Load More Buttons
- "Load More" or "Show More" buttons
- Automatically clicks buttons and waits for content
- Handles multiple load more interactions

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

### Using Different LLM Providers

The API supports multiple LLM providers. To use a different provider, modify the LLM initialization in `src/index.ts`:

```typescript
// OpenAI (default)
import { openai } from '@ai-sdk/openai'
const llm = openai.chat('gpt-4o')

// Anthropic
import { anthropic } from '@ai-sdk/anthropic'
const llm = anthropic('claude-3-5-sonnet-20240620')

// Google
import { google } from '@ai-sdk/google'
const llm = google('gemini-1.5-flash')

// Groq
import { createOpenAI } from '@ai-sdk/openai'
const groq = createOpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY,
})
const llm = groq('llama3-8b-8192')
```

## Development

### Project Structure

```
src/
├── controllers/          # API controllers
├── services/            # Business logic
├── utils/               # Utility classes
├── routes/              # Express routes
├── types.ts             # TypeScript type definitions
└── index.ts             # Main application entry point
```

### Running Tests

```bash
npm test
```

### Building for Production

```bash
npm run build
```

## Error Handling

The API provides comprehensive error handling:

- **Validation Errors**: Invalid request data returns 400 with detailed error messages
- **Scraping Errors**: Failed scraping attempts return 500 with error details
- **Network Errors**: Connection issues are caught and reported
- **LLM Errors**: AI processing errors are handled gracefully

## Performance Considerations

- **Token Limits**: Configure appropriate token limits for large pages
- **Page Limits**: Set reasonable max_pages to avoid infinite loops
- **Wait Times**: Adjust wait times based on page loading speed
- **Browser Resources**: Each scraping request launches a new browser instance

## Security

- **Input Validation**: All inputs are validated using Zod schemas
- **CORS**: Configured for cross-origin requests
- **Helmet**: Security headers enabled
- **Rate Limiting**: Consider implementing rate limiting for production use

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details
# crawl
