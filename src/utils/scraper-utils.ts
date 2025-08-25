import { Page } from 'playwright'
import { AgentMarkdown } from 'agentmarkdown'

export const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function convertPageToMarkdown(page: Page): Promise<string> {
  try {
    // Get the HTML content
    const html = await page.evaluate(() => document.documentElement.outerHTML)
    
    // Convert to markdown using AgentMarkdown
    const markdown = AgentMarkdown.produce(html)
    
    return markdown
  } catch (error) {
    console.error('Error converting page to markdown:', error)
    return ''
  }
}