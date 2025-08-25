import { z } from 'zod'
import OpenAI from 'openai'
import { SchemaGenerationResult } from '../types.js'

export class SchemaGeneratorV1 {
  private openai: OpenAI

  constructor(apiKey: string) {
    this.openai = new OpenAI({
      apiKey: apiKey
    })
  }

  /**
   * Generate a Zod schema based on source code by extracting CSS selectors
   */
  async generateSchema(
    sourceCode: string,
    userInstructions?: string,
    dataHints?: any
  ): Promise<SchemaGenerationResult> {
    try {
      const selectorPrompt = this.createCssSelectorPrompt(sourceCode, userInstructions)
      const navigationPrompt = this.createNavigationDetectionPrompt(sourceCode)
      const cssSelectors = await this.extractCssSelectors(selectorPrompt)
      const navigationPatterns = await this.extractNavigationPatterns(navigationPrompt)
      const schema = this.createZodSchemaFromSelectors(cssSelectors)
      const fields = Object.keys(cssSelectors)
      
      return {
        schema,
        confidence: 0.8,
        fields,
        cssSelectors,
        navigationPatterns
      }
    } catch (error) {
      console.error('Error in schema generation:', error)
      return this.createFallbackSchema()
    }
  }

  /**
   * Create prompt for CSS selector extraction
   */
  private createCssSelectorPrompt(sourceCode: string, userInstructions?: string): string {
    let prompt = `Look at this HTML source code and find repeating elements in rows/cards/etc. 

Return an object with all the CSS selectors that are repeated across multiple similar elements. Focus on selectors that appear to represent data fields like titles, descriptions, prices, ratings, etc.

For each repeating element, identify the CSS selectors that contain the actual data (not just structural elements).

IMPORTANT: Use specific and accurate CSS selectors. Look for:
- Class names: .title, .author, .points
- ID attributes: #title, #author
- Data attributes: [data-field="title"], [data-testid="author"]
- Nested selectors: .item .title, .card .author
- Text content patterns: elements containing specific text patterns
- Position-based selectors: nth-child, first-child, last-child

Return ONLY a valid JSON object where:
- Keys are descriptive field names (like "title", "price", "author", etc.)
- Values are the CSS selectors that extract that data (be specific and accurate)

Example response format:
{
  "title": ".titleline a, .story-title, h3 a",
  "author": ".hnuser, .author, .byline",
  "points": ".score, .points, .rating",
  "comments": ".comments, .comment-count, a[href*='item']",
  "age": ".age, .time, .date",
  "site": ".sitebit a, .domain, .source"
}

Source Code:
${sourceCode}

${userInstructions ? `User Instructions: ${userInstructions}` : ''}

Return only the JSON object, no other text.`

    return prompt
  }

  /**
   * Extract CSS selectors using OpenAI
   */
  private async extractCssSelectors(prompt: string): Promise<Record<string, string>> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a web scraping expert. Extract CSS selectors from HTML source code that represent repeating data elements. Return only valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 1000
      })

      const content = response.choices[0]?.message?.content
      if (!content) {
        throw new Error('No response from OpenAI')
      }

      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No JSON found in response')
      }

      const cssSelectors = JSON.parse(jsonMatch[0])
      return cssSelectors
    } catch (error) {
      console.error('Error extracting CSS selectors:', error)
      return {}
    }
  }

  /**
   * Create Zod schema from CSS selectors
   */
  private createZodSchemaFromSelectors(cssSelectors: Record<string, string>): z.ZodSchema<any> {
    const schemaObject: any = {}

    Object.entries(cssSelectors).forEach(([fieldName, selector]) => {
      const cleanFieldName = this.cleanFieldName(fieldName)
      schemaObject[cleanFieldName] = z.string().optional()
    })

    return z.object({
      items: z.array(z.object(schemaObject)).max(100)
    })
  }

  /**
   * Clean field name for use as object key
   */
  private cleanFieldName(fieldName: string): string {
    return fieldName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
  }

  /**
   * Create prompt for navigation pattern detection
   */
  private createNavigationDetectionPrompt(sourceCode: string): string {
    const prompt = `Analyze this HTML source code to detect navigation patterns for pagination, infinite scroll, and load more functionality.

Look for:
1. Pagination: Next/Previous buttons, page numbers, "Page X of Y" text
2. Infinite Scroll: Scroll event listeners, intersection observers, "load more on scroll" indicators
3. Load More: "Load More", "Show More", "Load Additional" buttons

Return ONLY a valid JSON object with this structure:
{
  "hasPagination": true/false,
  "hasInfiniteScroll": true/false,
  "hasLoadMore": true/false,
  "paginationSelectors": [".next", ".pagination", ".page-numbers"],
  "loadMoreSelectors": [".load-more", ".show-more", ".load-additional"],
  "infiniteScrollSelectors": [".infinite-scroll", ".scroll-container"],
  "confidence": 0.8
}

Source Code:
${sourceCode}

Return only the JSON object, no other text.`

    return prompt
  }

  /**
   * Extract navigation patterns using OpenAI
   */
  private async extractNavigationPatterns(prompt: string): Promise<any> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a web scraping expert. Detect navigation patterns in HTML source code. Return only valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 500
      })

      const content = response.choices[0]?.message?.content
      if (!content) {
        throw new Error('No response from OpenAI')
      }

      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No JSON found in response')
      }

      const navigationPatterns = JSON.parse(jsonMatch[0])
      return navigationPatterns
    } catch (error) {
      console.error('Error extracting navigation patterns:', error)
      return {
        hasPagination: false,
        hasInfiniteScroll: false,
        hasLoadMore: false,
        paginationSelectors: [],
        loadMoreSelectors: [],
        infiniteScrollSelectors: [],
        confidence: 0.0
      }
    }
  }

  /**
   * Create fallback schema when generation fails
   */
  private createFallbackSchema(): SchemaGenerationResult {
    const fallbackSchema = z.object({
      items: z.array(z.object({
        title: z.string().optional(),
        content: z.string().optional(),
        url: z.string().url().optional(),
        timestamp: z.string().optional()
      })).max(50)
    })

    return {
      schema: fallbackSchema,
      confidence: 0.1,
      fields: ['title', 'content', 'url', 'timestamp'],
      cssSelectors: {
        title: '.title, h1, h2, h3',
        content: '.content, .description, p',
        url: 'a[href]',
        timestamp: '.time, .date, .timestamp'
      },
      navigationPatterns: {
        hasPagination: false,
        hasInfiniteScroll: false,
        hasLoadMore: false,
        paginationSelectors: [],
        loadMoreSelectors: [],
        infiniteScrollSelectors: [],
        confidence: 0.0
      }
    }
  }
}
