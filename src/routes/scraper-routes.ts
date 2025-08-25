import { Router } from 'express'
import { ScraperController } from '../controllers/scraper-controller.js'
import { LanguageModelV1 } from '@ai-sdk/provider'

export function createScraperRoutes(llm: LanguageModelV1): Router {
  const router = Router()
  const controller = new ScraperController(llm, process.env.OPENAI_API_KEY)

  router.post('/scrape', (req, res) => controller.scrape(req, res))
  router.post('/scrape-v1', (req, res) => controller.scrapeWithV1(req, res))
  router.post('/test-schema', (req, res) => controller.testSchemaGenerator(req, res))
  router.get('/health', (req, res) => controller.healthCheck(req, res))
  router.get('/info', (req, res) => controller.getApiInfo(req, res))

  return router
}
