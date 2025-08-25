import { Page } from 'playwright'
import { AgentMarkdown } from 'agentmarkdown'
import { JSDOM } from 'jsdom'

export const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function convertPageToMarkdown(page: Page): Promise<string> {
  try {
    const html = await page.evaluate(() => document.documentElement.outerHTML)
    const markdown = AgentMarkdown.produce(html)
    return markdown
  } catch (error) {
    console.error('Error converting page to markdown:', error)
    return ''
  }
}

export function preprocessSourceCode(html: string, maxSize: number = 100000): string {
  try {
    // Remove script and style tags
    html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    
    // Remove HTML comments
    html = html.replace(/<!--[\s\S]*?-->/g, '')
    
    // Parse HTML with JSDOM
    const dom = new JSDOM(html)
    const document = dom.window.document
    
    // Remove common noise elements
    const noiseSelectors = [
      'header', 'footer', 'nav',
      '.header', '.footer', '.navigation', '.navbar',
      '.ads', '.advertisement', '.banner',
      '.sidebar', '.sidebar-left', '.sidebar-right',
      '.cookie-notice', '.cookie-banner', '.privacy-notice',
      '.newsletter', '.subscribe', '.signup',
      '.social-share', '.social-media',
      '.breadcrumb', '.breadcrumbs',
      '.pagination', '.pager',
      '.related', '.recommended',
      '.modal', '.popup', '.overlay',
      '.loading', '.spinner',
      '.back-to-top', '.scroll-to-top'
    ]
    
    // Remove noise elements
    noiseSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector)
      elements.forEach(el => el.remove())
    })
    
    // Remove meta tags
    const metaTags = document.querySelectorAll('meta')
    metaTags.forEach(el => el.remove())
    
    // Remove link tags (except for stylesheets)
    const linkTags = document.querySelectorAll('link:not([rel="stylesheet"])')
    linkTags.forEach(el => el.remove())
    
    // Get the cleaned HTML
    let cleanedHtml = document.documentElement.outerHTML
    
    // Remove extra whitespace and newlines
    cleanedHtml = cleanedHtml.replace(/\s+/g, ' ').trim()
    
    // Limit size if needed
    if (cleanedHtml.length > maxSize) {
      cleanedHtml = cleanedHtml.substring(0, maxSize)
    }
    
    return cleanedHtml
  } catch (error) {
    console.error('Error preprocessing source code:', error)
    return html.substring(0, maxSize)
  }
}