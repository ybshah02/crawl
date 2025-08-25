import { Request, Response } from 'express'
import { ScraperService } from '../services/scraper-service.js'
import { ScrapeRequestSchema, ScrapeResponse } from '../types.js'
import { LanguageModelV1 } from '@ai-sdk/provider'

export class ScraperController {
  private scraperService: ScraperService

  constructor(llm: LanguageModelV1, openaiApiKey?: string) {
    this.scraperService = new ScraperService(llm, openaiApiKey)
  }

  /**
   * Handle scraping requests
   */
  async scrape(req: Request, res: Response): Promise<void> {
    try {
      const validationResult = ScrapeRequestSchema.safeParse(req.body)
      
      if (!validationResult.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid request data',
          details: validationResult.error.errors
        })
        return
      }

      const request = validationResult.data
      
      console.log(`Scraping request received for URL: ${request.url}`)
      const result = await this.scraperService.scrape(request)
      res.status(result.success ? 200 : 500).json(result)
      
    } catch (error) {
      console.error('Controller error:', error)
      
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      })
    }
  }

  /**
   * Health check endpoint
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'Easy Scraper API'
    })
  }

  /**
   * Scrape using V1 schema generator with CSS selectors and navigation
   */
  async scrapeWithV1(req: Request, res: Response): Promise<void> {
    try {
      const validationResult = ScrapeRequestSchema.safeParse(req.body)
      
      if (!validationResult.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid request data',
          details: validationResult.error.errors
        })
        return
      }

      const request = validationResult.data
      
      console.log(`V1 scraping request received for URL: ${request.url}`)
      const result = await this.scraperService.scrapeWithV1(request)
      res.status(result.success ? 200 : 500).json(result)
      
    } catch (error) {
      console.error('V1 scraping error:', error)
      
      res.status(500).json({
        success: false,
        error: 'V1 scraping failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      })
    }
  }



  /**
   * Get API information
   */
  async getApiInfo(req: Request, res: Response): Promise<void> {
    res.status(200).json({
      name: 'Easy Scraper API',
      version: '1.0.0',
      description: 'AI-powered web scraper using llm-scraper',
      endpoints: {
        'POST /api/scrape': 'Scrape a webpage and extract structured data (V2)',
        'POST /api/scrape-v1': 'Scrape using V1 schema generator with CSS selectors',
        'GET /api/health': 'Health check endpoint',
        'GET /api/info': 'API information'
      },
      features: [
        'Automatic page navigation detection',
        'Support for pagination, infinite scroll, and load more buttons',
        'AI-powered schema generation',
        'Markdown conversion for better LLM processing',
        'Configurable scraping parameters'
      ]
    })
  }
}
