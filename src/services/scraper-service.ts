import { chromium, Browser, Page } from 'playwright'
import { LanguageModelV1 } from '@ai-sdk/provider'
import { SchemaGeneratorV1 } from '../utils/schema-generator.js'
import { SchemaGeneratorV2 } from '../utils/schema-generator-v2.js'
import { delay, preprocessSourceCode } from '../utils/scraper-utils.js'
import { 
  ScrapeRequest, 
  ScrapeResponse, 
} from '../types.js'

export class ScraperService {
  private browser: Browser | null = null
  private schemaGeneratorV2: SchemaGeneratorV2
  private schemaGeneratorV1: SchemaGeneratorV1

  constructor(llm: LanguageModelV1, openaiApiKey?: string) {
    this.schemaGeneratorV2 = new SchemaGeneratorV2(llm)
    this.schemaGeneratorV1 = new SchemaGeneratorV1(openaiApiKey || process.env.OPENAI_API_KEY || '')
  }

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

  private async getSourceCode(page: Page): Promise<string> {
    return await page.evaluate(() => {
      return document.documentElement.outerHTML
    })
  }

  async scrape(request: ScrapeRequest): Promise<ScrapeResponse> {
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

  async scrapeWithV1(request: ScrapeRequest): Promise<ScrapeResponse> {
    const startTime = Date.now()
    let browser: Browser | null = null
    let page: Page | null = null
    
    try {
      browser = await this.initializeBrowser()
      page = await browser.newPage()
      
      await page.goto(request.url, { waitUntil: 'networkidle' })
      
      const rawSourceCode = await this.getSourceCode(page)
      const preprocessedSourceCode = preprocessSourceCode(rawSourceCode, 100000)
      
      console.log(`Original source code: ${rawSourceCode.length} chars, Preprocessed: ${preprocessedSourceCode.length} chars`)
      
      const schemaResult = await this.schemaGeneratorV1.generateSchema(
        preprocessedSourceCode,
        request.scraping_instructions
      )
      
      if (schemaResult.fields.length === 0) {
        console.log('⚠️ No fields found in schema')
      }
      
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
      const pageData = await this.extractDataWithSelectors(page, schemaResult)
      allData.push(...pageData)
      
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
    
    return allData
  }

  private async extractDataWithSelectors(page: Page, schemaResult: any): Promise<any[]> {
    const data: any[] = []
    
    if (schemaResult.fields.length === 0) {
      return data
    }
    
    const commonSelectors = [
      'tr.athing',
      'tr',
      '.item', '.card', '.product', '.article', '.post',
      '[class*="item"]', '[class*="card"]', '[class*="product"]',
      'li',
      'div'
    ]
    
    let baseSelector = null
    for (const selector of commonSelectors) {
      const elements = await page.$$(selector)
      if (elements.length > 1) {
        baseSelector = selector
        break
      }
    }
    
    if (!baseSelector) {
      return await this.extractDataDirect(page, schemaResult)
    }
    
    const items = await page.$$(baseSelector)
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const itemData: any = {}
      
      for (const field of schemaResult.fields) {
        try {
          const fieldSelectors = this.getFieldSelectors(schemaResult, field)
          
          for (const selector of fieldSelectors) {
            try {
              const fieldElement = await item.$(selector)
              if (fieldElement) {
                const text = await fieldElement.textContent()
                if (text && text.trim()) {
                  itemData[field] = text.trim()
                  break
                }
              }
            } catch (error) {
            }
          }
          
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
              }
            }
          }
        } catch (error) {
          console.log(`⚠️ Error extracting field ${field}:`, error)
        }
      }
      
      if (Object.keys(itemData).length > 0) {
        data.push(itemData)
      }
    }
    
    return data
  }

  private async extractDataDirect(page: Page, schemaResult: any): Promise<any[]> {
    const data: any[] = []
    
    const fieldElements: Record<string, any[]> = {}
    
    for (const field of schemaResult.fields) {
      try {
        const elements = await page.$$(`[class*="${field}"]`)
        fieldElements[field] = elements
      } catch (error) {
      }
    }
    
    const maxElements = Math.max(...Object.values(fieldElements).map(elements => elements.length))
    
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

  private getFieldSelectors(schemaResult: any, field: string): string[] {
    if (schemaResult.cssSelectors && schemaResult.cssSelectors[field]) {
      return schemaResult.cssSelectors[field].split(',').map((s: string) => s.trim())
    }
    
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

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }
  }

  private async navigateToNextPage(
    page: Page,
    navigationPatterns: any,
    request: ScrapeRequest
  ): Promise<boolean> {
    if (!navigationPatterns) {
      return false
    }
    
    try {
      if (navigationPatterns.hasPagination && navigationPatterns.paginationSelectors) {
        for (const selector of navigationPatterns.paginationSelectors) {
          const nextButton = await page.$(`${selector}:not([disabled])`)
          if (nextButton) {
            await nextButton.click()
            await page.waitForLoadState('networkidle')
            return true
          }
        }
      }
      
      if (navigationPatterns.hasLoadMore && navigationPatterns.loadMoreSelectors) {
        for (const selector of navigationPatterns.loadMoreSelectors) {
          const loadMoreButton = await page.$(`${selector}:not([disabled])`)
          if (loadMoreButton) {
            await loadMoreButton.click()
            await page.waitForLoadState('networkidle')
            return true
          }
        }
      }
      
      if (navigationPatterns.hasInfiniteScroll) {
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight)
        })
        await delay(2000)
        return true
      }
      
      return false
      
    } catch (error) {
      return false
    }
  }
}
