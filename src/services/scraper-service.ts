import { chromium, Browser, Page } from 'playwright'
import { LanguageModelV1 } from '@ai-sdk/provider'
import LLMScraper from '../../llm-scraper/src/index.js'
import { PageAnalyzer } from '../utils/page-analyzer.js'
import { SchemaGeneratorV1 } from '../utils/schema-generator.js'
import { SchemaGeneratorV2 } from '../utils/schema-generator-v2.js'
import { delay } from '../utils/scraper-utils.js'
import { 
  ScrapeRequest, 
  ScrapeResponse, 
} from '../types.js'

export class ScraperService {
  private browser: Browser | null = null
  private llm: LanguageModelV1
  private scraper: LLMScraper
  private pageAnalyzer: PageAnalyzer | null = null
  // Schema Generator V2 (Heuristic-based field detection)
  private schemaGeneratorV2: SchemaGeneratorV2
  // Schema Generator V1 (CSS selector extraction)
  private schemaGeneratorV1: SchemaGeneratorV1

  constructor(llm: LanguageModelV1, openaiApiKey?: string) {
    this.llm = llm
    this.scraper = new LLMScraper(llm)
    // Schema Generator V2 (Heuristic-based field detection)
    this.schemaGeneratorV2 = new SchemaGeneratorV2(llm)
    // Schema Generator V1 (CSS selector extraction)
    this.schemaGeneratorV1 = new SchemaGeneratorV1(openaiApiKey || process.env.OPENAI_API_KEY || '')
  }

  /**
   * Initialize browser instance
   */
  private async initializeBrowser(): Promise<Browser> {
    if (!this.browser || this.browser.isConnected() === false) {
      if (this.browser) {
        await this.browser.close()
      }
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      })
    }
    return this.browser
  }

  /**
   * Get the HTML source code from a page
   */
  private async getSourceCode(page: Page): Promise<string> {
    return await page.evaluate(() => {
      return document.documentElement.outerHTML
    })
  }

  /**
   * Main scraping method - V2 (Heuristic-based)
   */
  async scrape(request: ScrapeRequest): Promise<ScrapeResponse> {
    // TODO: Implement V2 scraper with heuristic-based field detection
    // This should use the V2 schema generator and extract data using markdown analysis
    console.log('V2 scraper not yet implemented - TODO')
    
    return {
      success: false,
      data: [],
      metadata: {
        url: request.url,
        pages_scraped: 0,
        total_items: 0,
        processing_time_ms: 0,
        errors: ['V2 scraper not yet implemented']
      }
    }
  }

  /**
   * Scrape using V1 schema generator with CSS selectors and navigation
   */
  async scrapeWithV1(request: ScrapeRequest): Promise<ScrapeResponse> {
    const startTime = Date.now()
    let browser: Browser | null = null
    let page: Page | null = null
    
    try {
      console.log(`🚀 Starting V1 scraper for URL: ${request.url}`)
      
      // Initialize browser
      browser = await this.initializeBrowser()
      page = await browser.newPage()
      
      // Navigate to the page
      await page.goto(request.url, { waitUntil: 'networkidle' })
      
      // Step 1: Generate schema and detect navigation patterns
      console.log('📋 Step 1: Generating schema and detecting navigation patterns...')
      const sourceCode = await this.getSourceCode(page)
      const schemaResult = await this.schemaGeneratorV1.generateSchema(
        sourceCode,
        request.scraping_instructions
      )
      
      console.log(`✅ Schema generated with ${schemaResult.fields.length} fields`)
      console.log(`🧭 Navigation patterns detected:`, schemaResult.navigationPatterns)
      
      // Step 2: Extract data from all pages using navigation
      console.log('📊 Step 2: Extracting data from all pages...')
      const allData = await this.extractDataWithNavigation(
        page,
        schemaResult,
        request
      )
      
      const processingTime = Date.now() - startTime
      
      return {
        success: true,
        data: allData,
        metadata: {
          url: request.url,
          pages_scraped: allData.length > 0 ? 1 : 0,
          total_items: allData.length,
          processing_time_ms: processingTime,
          schema_fields: schemaResult.fields,
          schema_confidence: schemaResult.confidence,
          field_types: schemaResult.fieldTypes || {},
          field_sources: schemaResult.fieldSources || {},
          navigation_patterns: schemaResult.navigationPatterns
        }
      }
      
    } catch (error) {
      console.error('V1 scraping error:', error)
      return {
        success: false,
        data: [],
        metadata: {
          url: request.url,
          pages_scraped: 0,
          total_items: 0,
          processing_time_ms: Date.now() - startTime,
          errors: [error instanceof Error ? error.message : 'Unknown error']
        }
      }
    } finally {
      if (page) await page.close()
      // Don't close the browser here - let it be reused
    }
  }

  /**
   * Test schema generator with URL
   */
  async testSchemaGenerator(url: string, userInstructions?: string): Promise<any> {
    let browser: Browser | null = null
    let page: Page | null = null
    
    try {
      console.log(`Testing schema generator with URL: ${url}`)
      
      // Initialize browser and fetch page
      browser = await this.initializeBrowser()
      page = await browser.newPage()
      
      await page.goto(url, { waitUntil: 'networkidle' })
      
      // Get source code from the page
      const sourceCode = await this.getSourceCode(page)
      
      console.log(`Fetched source code (${sourceCode.length} characters)`)
      
      // Generate schema using V1
      const result = await this.schemaGeneratorV1.generateSchema(
        sourceCode,
        userInstructions
      )
      
      return {
        url: url,
        sourceCodeLength: sourceCode.length,
        schema: result.schema,
        confidence: result.confidence,
        fields: result.fields,
        fieldTypes: result.fieldTypes,
        fieldSources: result.fieldSources,
        navigationPatterns: result.navigationPatterns
      }
    } catch (error) {
      console.error('Error testing schema generator:', error)
      throw error
    } finally {
      if (page) await page.close()
      // Don't close the browser here - let it be reused
    }
  }

  /**
   * Extract data using CSS selectors and handle navigation
   */
  private async extractDataWithNavigation(
    page: Page,
    schemaResult: any,
    request: ScrapeRequest
  ): Promise<any[]> {
    const allData: any[] = []
    let currentPage = 1
    let hasMorePages = true
    
    while (hasMorePages && currentPage <= request.max_pages) {
      console.log(`📄 Processing page ${currentPage}...`)
      
      // Extract data from current page using CSS selectors
      const pageData = await this.extractDataWithSelectors(page, schemaResult)
      allData.push(...pageData)
      
      console.log(`✅ Extracted ${pageData.length} items from page ${currentPage}`)
      
      // Check if we should continue to next page
      if (currentPage < request.max_pages) {
        hasMorePages = await this.navigateToNextPage(page, schemaResult.navigationPatterns, request)
        if (hasMorePages) {
          currentPage++
          await delay(request.wait_time)
        }
      } else {
        hasMorePages = false
      }
    }
    
    console.log(`🎯 Total items extracted: ${allData.length} from ${currentPage} pages`)
    return allData
  }

  /**
   * Extract data from current page using CSS selectors
   */
  private async extractDataWithSelectors(page: Page, schemaResult: any): Promise<any[]> {
    const data: any[] = []
    
    // Get the first field to determine the base selector
    if (schemaResult.fields.length === 0) {
      console.log('⚠️ No fields found in schema')
      return data
    }
    
    // Try to find a common parent element that contains all items
    const commonSelectors = [
      'tr.athing', // Hacker News specific
      'tr', // For table rows
      '.item', '.card', '.product', '.article', '.post', // Common item containers
      '[class*="item"]', '[class*="card"]', '[class*="product"]', // Generic patterns
      'li', // List items
      'div' // Generic divs
    ]
    
    let baseSelector = null
    for (const selector of commonSelectors) {
      const elements = await page.$$(selector)
      if (elements.length > 1) {
        baseSelector = selector
        console.log(`🔍 Found base selector: ${selector} with ${elements.length} elements`)
        break
      }
    }
    
    if (!baseSelector) {
      console.log('⚠️ No common base selector found, trying direct field extraction')
      return await this.extractDataDirect(page, schemaResult)
    }
    
    // Extract data from each item using the base selector
    const items = await page.$$(baseSelector)
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const itemData: any = {}
      
      // Extract each field using CSS selectors from the schema
      for (const field of schemaResult.fields) {
        try {
          // Get the CSS selectors for this field from the schema
          const fieldSelectors = this.getFieldSelectors(schemaResult, field)
          
          // Try each selector until we find the field
          for (const selector of fieldSelectors) {
            try {
              // Try to find the field within this item
              const fieldElement = await item.$(selector)
              if (fieldElement) {
                const text = await fieldElement.textContent()
                if (text && text.trim()) {
                  itemData[field] = text.trim()
                  break // Found the field, move to next field
                }
              }
            } catch (error) {
              // Continue to next selector
            }
          }
          
          // If not found within item, try globally on the page
          if (!itemData[field]) {
            for (const selector of fieldSelectors) {
              try {
                const elements = await page.$$(selector)
                if (elements[i]) {
                  const text = await elements[i].textContent()
                  if (text && text.trim()) {
                    itemData[field] = text.trim()
                    break
                  }
                }
              } catch (error) {
                // Continue to next selector
              }
            }
          }
        } catch (error) {
          console.log(`⚠️ Error extracting field ${field}:`, error)
        }
      }
      
      // Only add item if it has some data
      if (Object.keys(itemData).length > 0) {
        data.push(itemData)
      }
    }
    
    return data
  }

  /**
   * Extract data directly without base selector
   */
  private async extractDataDirect(page: Page, schemaResult: any): Promise<any[]> {
    const data: any[] = []
    
    // For each field, find all elements and create items
    const fieldElements: Record<string, any[]> = {}
    
    for (const field of schemaResult.fields) {
      try {
        const elements = await page.$$(`[class*="${field}"]`)
        fieldElements[field] = elements
        console.log(`🔍 Found ${elements.length} elements for field: ${field}`)
      } catch (error) {
        console.log(`⚠️ Error finding elements for field ${field}:`, error)
      }
    }
    
    // Find the maximum number of elements across all fields
    const maxElements = Math.max(...Object.values(fieldElements).map(elements => elements.length))
    
    // Create items by combining elements at the same index
    for (let i = 0; i < maxElements; i++) {
      const itemData: any = {}
      
      for (const field of schemaResult.fields) {
        const elements = fieldElements[field]
        if (elements && elements[i]) {
          try {
            const text = await elements[i].textContent()
            itemData[field] = text?.trim() || ''
          } catch (error) {
            console.log(`⚠️ Error extracting text for field ${field}:`, error)
          }
        }
      }
      
      if (Object.keys(itemData).length > 0) {
        data.push(itemData)
      }
    }
    
    return data
  }

  /**
   * Get CSS selectors for a specific field from the schema
   */
  private getFieldSelectors(schemaResult: any, field: string): string[] {
    // If we have the actual CSS selectors from the schema, use them
    if (schemaResult.cssSelectors && schemaResult.cssSelectors[field]) {
      return schemaResult.cssSelectors[field].split(',').map((s: string) => s.trim())
    }
    
    // Fallback to common patterns for the field
    const commonSelectors = {
      title: ['.titleline a', '.title a', 'h3 a', 'h2 a', '.headline', '.name', '[class*="title"]'],
      author: ['.hnuser', '.author', '.byline', '.user', '[class*="author"]'],
      points: ['.score', '.points', '.rating', '.votes', '[class*="points"]'],
      comments: ['.comments', '.comment-count', 'a[href*="item"]', '[class*="comments"]'],
      age: ['.age', '.time', '.date', '.timestamp', '[class*="age"]'],
      site: ['.sitebit a', '.domain', '.source', '.url', '[class*="site"]']
    }
    
    return commonSelectors[field as keyof typeof commonSelectors] || [`[class*="${field}"]`]
  }

  /**
   * Close the browser instance (call this when shutting down the service)
   */
  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }
  }

  /**
   * Navigate to next page using detected navigation patterns
   */
  private async navigateToNextPage(
    page: Page,
    navigationPatterns: any,
    request: ScrapeRequest
  ): Promise<boolean> {
    if (!navigationPatterns) {
      console.log('⚠️ No navigation patterns detected')
      return false
    }
    
    try {
      // Try pagination first
      if (navigationPatterns.hasPagination && navigationPatterns.paginationSelectors) {
        for (const selector of navigationPatterns.paginationSelectors) {
          const nextButton = await page.$(`${selector}:not([disabled])`)
          if (nextButton) {
            console.log(`📄 Clicking pagination button: ${selector}`)
            await nextButton.click()
            await page.waitForLoadState('networkidle')
            return true
          }
        }
      }
      
      // Try load more button
      if (navigationPatterns.hasLoadMore && navigationPatterns.loadMoreSelectors) {
        for (const selector of navigationPatterns.loadMoreSelectors) {
          const loadMoreButton = await page.$(`${selector}:not([disabled])`)
          if (loadMoreButton) {
            console.log(`📄 Clicking load more button: ${selector}`)
            await loadMoreButton.click()
            await page.waitForLoadState('networkidle')
            return true
          }
        }
      }
      
      // Try infinite scroll
      if (navigationPatterns.hasInfiniteScroll) {
        console.log('📄 Attempting infinite scroll...')
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight)
        })
        await delay(2000) // Wait for content to load
        return true
      }
      
      console.log('⚠️ No more navigation options available')
      return false
      
    } catch (error) {
      console.log('⚠️ Error navigating to next page:', error)
      return false
    }
  }
}
