import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import { openai } from '@ai-sdk/openai'
import { createScraperRoutes } from './routes/scraper-routes.js'

// Load environment variables
dotenv.config()

// Initialize Express app
const app = express()
const PORT = process.env.PORT || 3000

// Initialize LLM
const llm = openai.chat('gpt-4o')

// Middleware
app.use(helmet())
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`)
  next()
})

// Routes
app.use('/api', createScraperRoutes(llm))

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Easy Scraper API',
    version: '1.0.0',
    endpoints: {
      'POST /api/scrape': 'Scrape a webpage',
      'GET /api/health': 'Health check',
      'GET /api/info': 'API information'
    }
  })
})

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err)
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  })
})

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    message: `The endpoint ${req.method} ${req.originalUrl} does not exist`
  })
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Easy Scraper API server running on port ${PORT}`)
  console.log(`📖 API Documentation available at http://localhost:${PORT}/api/info`)
  console.log(`💚 Health check available at http://localhost:${PORT}/api/health`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully')
  process.exit(0)
})
