import { Page, ElementHandle } from 'playwright'
import { ScrapingStrategy } from '../types.js'

export class PageAnalyzer {
  private page: Page

  constructor(page: Page) {
    this.page = page
  }

  /**
   * Analyze the page to determine the best scraping strategy
   */
  async analyzePage(): Promise<{
    strategy: ScrapingStrategy
    confidence: number
    selectors: {
      pagination?: string[]
      loadMore?: string[]
      infiniteScroll?: boolean
    }
  }> {
    const selectors = await this.detectNavigationSelectors()
    const strategy = this.determineStrategy(selectors)
    
    return {
      strategy,
      confidence: this.calculateConfidence(selectors),
      selectors
    }
  }

  /**
   * Detect navigation elements on the page
   */
  private async detectNavigationSelectors(): Promise<{
    pagination: string[]
    loadMore: string[]
    infiniteScroll: boolean
  }> {
    const selectors = {
      pagination: [] as string[],
      loadMore: [] as string[],
      infiniteScroll: false
    }

    const paginationSelectors = [
      'a[href*="page="]',
      'a[href*="p="]',
      '.pagination a',
      '.pager a',
      '[data-page]',
      '.next',
      '.prev',
      '.page-numbers',
      '.pagination .next',
      '.pagination .prev'
    ]

    const loadMoreSelectors = [
      'button:contains("Load More")',
      'button:contains("Show More")',
      'button:contains("Load More Results")',
      '.load-more',
      '.show-more',
      '[data-load-more]',
      'a:contains("Load More")',
      'a:contains("Show More")'
    ]

    for (const selector of paginationSelectors) {
      try {
        const elements = await this.page.$$(selector)
        if (elements.length > 0) {
          selectors.pagination.push(selector)
        }
      } catch (error) {}
    }

    for (const selector of loadMoreSelectors) {
      try {
        const elements = await this.page.$$(selector)
        if (elements.length > 0) {
          selectors.loadMore.push(selector)
        }
      } catch (error) {}
    }

    selectors.infiniteScroll = await this.detectInfiniteScroll()

    return selectors
  }

  /**
   * Detect if the page uses infinite scroll
   */
  private async detectInfiniteScroll(): Promise<boolean> {
    try {
      const indicators = [
        'window.addEventListener("scroll"',
        'IntersectionObserver',
        'infinite-scroll',
        'lazy-load',
        'virtual-scroll'
      ]

      const pageContent = await this.page.content()
      const hasScrollListeners = indicators.some(indicator => 
        pageContent.includes(indicator)
      )

      const hasScrollEvents = await this.page.evaluate(() => {
        return window.addEventListener.toString().includes('scroll') ||
               document.addEventListener.toString().includes('scroll')
      })

      return hasScrollListeners || hasScrollEvents
    } catch (error) {
      return false
    }
  }

  /**
   * Determine the best scraping strategy based on detected elements
   */
  private determineStrategy(selectors: {
    pagination: string[]
    loadMore: string[]
    infiniteScroll: boolean
  }): ScrapingStrategy {
    if (selectors.pagination.length > 0) {
      return ScrapingStrategy.PAGINATION
    }
    
    if (selectors.loadMore.length > 0) {
      return ScrapingStrategy.LOAD_MORE
    }
    
    if (selectors.infiniteScroll) {
      return ScrapingStrategy.INFINITE_SCROLL
    }
    
    return ScrapingStrategy.SINGLE_PAGE
  }

  /**
   * Calculate confidence score for the detected strategy
   */
  private calculateConfidence(selectors: {
    pagination: string[]
    loadMore: string[]
    infiniteScroll: boolean
  }): number {
    let score = 0
    
    if (selectors.pagination.length > 0) {
      score += selectors.pagination.length * 0.3
    }
    
    if (selectors.loadMore.length > 0) {
      score += selectors.loadMore.length * 0.4
    }
    
    if (selectors.infiniteScroll) {
      score += 0.5
    }
    
    return Math.min(score, 1.0)
  }

  /**
   * Get the next page URL for pagination
   */
  async getNextPageUrl(): Promise<string | null> {
    const nextSelectors = [
      'a[href*="page="]',
      '.pagination .next',
      '.next',
      'a:contains("Next")',
      'a:contains(">")'
    ]

    for (const selector of nextSelectors) {
      try {
        const nextLink = await this.page.$(selector)
        if (nextLink) {
          const href = await nextLink.getAttribute('href')
          if (href) {
            return new URL(href, this.page.url()).href
          }
        }
      } catch (error) {
        // Continue to next selector
      }
    }

    return null
  }

  /**
   * Find load more button
   */
  async findLoadMoreButton(): Promise<ElementHandle | null> {
    const loadMoreSelectors = [
      'button:contains("Load More")',
      'button:contains("Show More")',
      '.load-more',
      '.show-more',
      '[data-load-more]'
    ]

    for (const selector of loadMoreSelectors) {
      try {
        const button = await this.page.$(selector)
        if (button) {
          const isVisible = await button.isVisible()
          if (isVisible) {
            return button
          }
        }
      } catch (error) {
        // Continue to next selector
      }
    }

    return null
  }
}
