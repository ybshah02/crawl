import { z } from 'zod'

// API Request Schema
export const ScrapeRequestSchema = z.object({
  url: z.string().url('Invalid URL provided'),
  scraping_instructions: z.string().optional(),
  max_pages: z.number().min(1).max(100).default(10),
  wait_time: z.number().min(1000).max(100000).default(2000),
  scroll_attempts: z.number().min(1).max(10).default(3),
  token_limit: z.number().min(1000).max(100000).default(50000)
})

export type ScrapeRequest = z.infer<typeof ScrapeRequestSchema>

// API Response Schema
export const ScrapeResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(z.record(z.any())),
  metadata: z.object({
    url: z.string(),
    pages_scraped: z.number(),
    total_items: z.number(),
    processing_time_ms: z.number(),
    errors: z.array(z.string()).optional(),
    schema_fields: z.array(z.string()).optional(),
    schema_confidence: z.number().optional(),
    field_types: z.record(z.string()).optional(),
    field_sources: z.record(z.array(z.string())).optional(),
    navigation_patterns: z.any().optional()
  })
})

export type ScrapeResponse = z.infer<typeof ScrapeResponseSchema>

// Page Navigation Options
export interface PageNavigationOptions {
  maxPages: number
  waitTime: number
  scrollAttempts: number
  tokenLimit: number
}

// Scraping Strategy
export enum ScrapingStrategy {
  SINGLE_PAGE = 'single_page',
  PAGINATION = 'pagination',
  INFINITE_SCROLL = 'infinite_scroll',
  LOAD_MORE = 'load_more'
}

// Page Content with Metadata
export interface PageContent {
  url: string
  content: string
  format: 'html' | 'markdown' | 'text'
  timestamp: Date
  pageNumber?: number
}

// Navigation Patterns
export interface NavigationPatterns {
  hasPagination: boolean
  hasInfiniteScroll: boolean
  hasLoadMore: boolean
  paginationSelectors?: string[]
  loadMoreSelectors?: string[]
  infiniteScrollSelectors?: string[]
  confidence: number
}

// Schema Generation Result
export interface SchemaGenerationResult {
  schema: z.ZodSchema<any>
  confidence: number
  fields: string[]
  fieldTypes?: Record<string, string>
  fieldSources?: Record<string, string[]>
  cssSelectors?: Record<string, string>
  navigationPatterns?: NavigationPatterns
}
