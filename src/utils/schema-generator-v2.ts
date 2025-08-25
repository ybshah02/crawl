import { z } from 'zod'
import { LanguageModelV1 } from '@ai-sdk/provider'

export interface SchemaGenerationResult {
  schema: z.ZodSchema<any>
  confidence: number
  fields: string[]
  fieldTypes: Record<string, string>
  fieldSources: Record<string, string[]>
}

export interface FieldCandidate {
  name: string
  value: string
  type: string
  source: string
  frequency: number
  attributes: Record<string, string>
  domPath: string
  sources?: string[]
}

export interface RowData {
  fields: Record<string, string>
  domPath: string
}

export class SchemaGeneratorV2 {
  private llm: LanguageModelV1

  constructor(llm: LanguageModelV1) {
    this.llm = llm
  }

  /**
   * Generate schema using heuristic-based field detection
   */
  async generateSchema(
    markdown: string,
    userInstructions?: string,
    dataHints?: any
  ): Promise<SchemaGenerationResult> {
    try {
      console.log('🔍 Schema Generator V2: Analyzing page structure...')

      // Step 1: Extract potential rows from markdown
      const rows = this.extractPotentialRows(markdown)
      console.log(`Found ${rows.length} potential data rows`)

      if (rows.length === 0) {
        return this.createFallbackSchema()
      }

      // Step 2: Detect field candidates from each row
      const fieldCandidates = this.detectFieldCandidates(rows)
      console.log(`Detected ${fieldCandidates.length} field candidates`)

      // Step 3: Merge and rank fields across rows
      const mergedFields = this.mergeFieldCandidates(fieldCandidates, rows.length)
      console.log(`Merged into ${mergedFields.length} fields`)

      // Step 4: Infer types for each field
      const typedFields = this.inferFieldTypes(mergedFields)

      // Step 5: Generate human-readable field names
      const namedFields = this.generateFieldNames(typedFields, userInstructions)

      // Step 6: Build Zod schema
      const schema = this.buildZodSchema(namedFields)

      return {
        schema,
        confidence: this.calculateConfidence(rows.length, namedFields.length),
        fields: namedFields.map(f => f.name),
        fieldTypes: Object.fromEntries(namedFields.map(f => [f.name, f.type])),
        fieldSources: Object.fromEntries(namedFields.map(f => [f.name, f.sources]))
      }
    } catch (error) {
      console.error('Error in schema generation v2:', error)
      return this.createFallbackSchema()
    }
  }

  /**
   * Extract potential data rows from markdown content
   */
  private extractPotentialRows(markdown: string): RowData[] {
    const rows: RowData[] = []
    const lines = markdown.split('\n')

    // First, try to extract structured data items
    const structuredItems = this.extractStructuredDataItems(markdown)
    if (structuredItems.length > 0) {
      return structuredItems
    }

    // Look for repeating patterns that suggest data rows
    const patterns = [
      // Structured data items (from direct extraction)
      /^### Item \d+$/,
      // Table rows
      /^\|(.+)\|$/,
      // List items with similar structure
      /^[-*+]\s+(.+)$/,
      // Numbered items
      /^\d+\.\s+(.+)$/,
      // Lines with links
      /\[([^\]]+)\]\(([^)]+)\)/,
      // Lines with multiple data points
      /^(.+?)\s+[-–—]\s+(.+)$/,
      // Hacker News style items (title by author points | comments)
      /^(.+?)\s+by\s+(.+?)\s+(\d+)\s+points?\s*\|\s*(\d+)\s+comments?$/,
      // Generic news items with points/comments
      /^(.+?)\s+(\d+)\s+points?\s*\|\s*(\d+)\s+comments?$/,
      // Items with author and points
      /^(.+?)\s+by\s+(.+?)\s+(\d+)\s+points?$/,
      // Items with just title and metadata
      /^(.+?)\s+(\d+)\s+points?$/,
      // E-commerce patterns (title - price)
      /^(.+?)\s+[-–—]\s*[\$€£¥₹]\s*(\d+([.,]\d{2})?)$/,
      // Product patterns (title | rating | price)
      /^(.+?)\s*\|\s*(\d+\.?\d*)\s*\|\s*[\$€£¥₹]\s*(\d+([.,]\d{2})?)$/,
      // Blog post patterns (title by author date)
      /^(.+?)\s+by\s+(.+?)\s+(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})$/,
      // Job listing patterns (title at company location)
      /^(.+?)\s+at\s+(.+?)\s+[-–—]\s+(.+)$/,
      // Lines with multiple words (potential content)
      /^(\w+(\s+\w+){2,})$/,
      // Lines with special characters (potential content)
      /^(.+?[!?.,;:])$/
    ]

    let currentRow: Record<string, string> = {}
    let rowIndex = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      // Check if this line matches any data pattern
      const isDataLine = patterns.some(pattern => pattern.test(line))
      
      if (isDataLine) {
        // Extract data from the line
        const fields = this.extractFieldsFromLine(line)
        
        if (Object.keys(fields).length > 0) {
          currentRow = { ...currentRow, ...fields }
          
          // If we have enough fields or hit a separator, save the row
          if (Object.keys(currentRow).length >= 2 || 
              i === lines.length - 1 || 
              this.isRowSeparator(lines[i + 1])) {
            
            rows.push({
              fields: { ...currentRow },
              domPath: `row_${rowIndex}`
            })
            currentRow = {}
            rowIndex++
          }
        }
      } else if (this.isRowSeparator(line)) {
        // Save current row if we have data
        if (Object.keys(currentRow).length > 0) {
          rows.push({
            fields: { ...currentRow },
            domPath: `row_${rowIndex}`
          })
          currentRow = {}
          rowIndex++
        }
      }
    }

    return rows
  }

  /**
   * Extract structured data items from markdown
   */
  private extractStructuredDataItems(markdown: string): RowData[] {
    const rows: RowData[] = []
    const lines = markdown.split('\n')
    
    let currentItem: Record<string, string> = {}
    let itemIndex = 0
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      
      // Check for item header
      const itemMatch = line.match(/^### Item (\d+)$/)
      if (itemMatch) {
        // Save previous item if exists
        if (Object.keys(currentItem).length > 0) {
          rows.push({
            fields: { ...currentItem },
            domPath: `item_${itemIndex}`
          })
          itemIndex++
        }
        currentItem = {}
        continue
      }
      
      // Check for field lines
      const fieldMatch = line.match(/^\*\*([^:]+):\*\*\s*(.+)$/)
      if (fieldMatch) {
        const fieldName = this.normalizeFieldName(fieldMatch[1].toLowerCase().trim())
        const fieldValue = fieldMatch[2].trim()
        
        if (fieldValue !== 'N/A') {
          currentItem[fieldName] = fieldValue
        }
      }
    }
    
    // Save the last item
    if (Object.keys(currentItem).length > 0) {
      rows.push({
        fields: { ...currentItem },
        domPath: `item_${itemIndex}`
      })
    }
    
    return rows
  }

  /**
   * Normalize field names to common patterns
   */
  private normalizeFieldName(fieldName: string): string {
    const fieldMappings: Record<string, string> = {
      // Common variations
      'title': 'title',
      'headline': 'title',
      'name': 'title',
      'product-name': 'title',
      'article-title': 'title',
      
      'description': 'description',
      'summary': 'description',
      'excerpt': 'description',
      'content': 'description',
      'text': 'description',
      
      'price': 'price',
      'cost': 'price',
      'amount': 'price',
      'value': 'price',
      
      'rating': 'rating',
      'score': 'rating',
      'stars': 'rating',
      'review-score': 'rating',
      
      'author': 'author',
      'byline': 'author',
      'creator': 'author',
      'user': 'author',
      
      'date': 'date',
      'time': 'date',
      'timestamp': 'date',
      'published': 'date',
      
      'image': 'image',
      'img': 'image',
      'photo': 'image',
      'thumbnail': 'image',
      
      'url': 'url',
      'link': 'url',
      'href': 'url',
      
      // Hacker News specific
      'points': 'points',
      'comments': 'comments'
    }
    
    return fieldMappings[fieldName] || fieldName
  }

  /**
   * Extract fields from a single line of markdown
   */
  private extractFieldsFromLine(line: string): Record<string, string> {
    const fields: Record<string, string> = {}

    // Extract links
    const linkMatches = line.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)
    for (const match of linkMatches) {
      fields[`link_${Object.keys(fields).length + 1}`] = match[1]
      fields[`url_${Object.keys(fields).length + 1}`] = match[2]
    }

    // Extract images
    const imageMatches = line.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)
    for (const match of imageMatches) {
      fields[`image_${Object.keys(fields).length + 1}`] = match[2]
      if (match[1]) {
        fields[`image_alt_${Object.keys(fields).length + 1}`] = match[1]
      }
    }

    // Extract bold text
    const boldMatches = line.matchAll(/\*\*([^*]+)\*\*/g)
    for (const match of boldMatches) {
      fields[`bold_${Object.keys(fields).length + 1}`] = match[1]
    }

    // Extract italic text
    const italicMatches = line.matchAll(/\*([^*]+)\*/g)
    for (const match of italicMatches) {
      fields[`italic_${Object.keys(fields).length + 1}`] = match[1]
    }

    // Extract code blocks
    const codeMatches = line.matchAll(/`([^`]+)`/g)
    for (const match of codeMatches) {
      fields[`code_${Object.keys(fields).length + 1}`] = match[1]
    }

    // Extract Hacker News specific patterns
    const hnPattern = line.match(/^(.+?)\s+by\s+(.+?)\s+(\d+)\s+points?\s*\|\s*(\d+)\s+comments?$/)
    if (hnPattern) {
      fields['title'] = hnPattern[1].trim()
      fields['author'] = hnPattern[2].trim()
      fields['points'] = hnPattern[3]
      fields['comments'] = hnPattern[4]
      return fields
    }

    // Extract generic news patterns
    const newsPattern = line.match(/^(.+?)\s+(\d+)\s+points?\s*\|\s*(\d+)\s+comments?$/)
    if (newsPattern) {
      fields['title'] = newsPattern[1].trim()
      fields['points'] = newsPattern[2]
      fields['comments'] = newsPattern[3]
      return fields
    }

    // Extract author and points pattern
    const authorPattern = line.match(/^(.+?)\s+by\s+(.+?)\s+(\d+)\s+points?$/)
    if (authorPattern) {
      fields['title'] = authorPattern[1].trim()
      fields['author'] = authorPattern[2].trim()
      fields['points'] = authorPattern[3]
      return fields
    }

    // Extract e-commerce patterns (title - price)
    const ecommercePattern = line.match(/^(.+?)\s+[-–—]\s*[\$€£¥₹]\s*(\d+([.,]\d{2})?)$/)
    if (ecommercePattern) {
      fields['title'] = ecommercePattern[1].trim()
      fields['price'] = ecommercePattern[2]
      return fields
    }

    // Extract product patterns (title | rating | price)
    const productPattern = line.match(/^(.+?)\s*\|\s*(\d+\.?\d*)\s*\|\s*[\$€£¥₹]\s*(\d+([.,]\d{2})?)$/)
    if (productPattern) {
      fields['title'] = productPattern[1].trim()
      fields['rating'] = productPattern[2]
      fields['price'] = productPattern[3]
      return fields
    }

    // Extract blog post patterns (title by author date)
    const blogPattern = line.match(/^(.+?)\s+by\s+(.+?)\s+(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})$/)
    if (blogPattern) {
      fields['title'] = blogPattern[1].trim()
      fields['author'] = blogPattern[2].trim()
      fields['date'] = blogPattern[3]
      return fields
    }

    // Extract job listing patterns (title at company location)
    const jobPattern = line.match(/^(.+?)\s+at\s+(.+?)\s+[-–—]\s+(.+)$/)
    if (jobPattern) {
      fields['title'] = jobPattern[1].trim()
      fields['company'] = jobPattern[2].trim()
      fields['location'] = jobPattern[3].trim()
      return fields
    }

    // Extract plain text segments
    const textSegments = line
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '') // Remove links
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '') // Remove images
      .replace(/\*\*([^*]+)\*\*/g, '') // Remove bold
      .replace(/\*([^*]+)\*/g, '') // Remove italic
      .replace(/`([^`]+)`/g, '') // Remove code
      .split(/\s+/)
      .filter(segment => segment.length > 0)

    textSegments.forEach((segment, index) => {
      if (segment.length > 1) {
        fields[`text_${index + 1}`] = segment
      }
    })

    return fields
  }

  /**
   * Check if a line is a row separator
   */
  private isRowSeparator(line: string): boolean {
    if (!line) return false
    
    const separators = [
      /^---+$/, // Horizontal rule
      /^===+$/, // Horizontal rule
      /^___+$/, // Horizontal rule
      /^\s*$/,  // Empty line
      /^#+\s/,  // Headers
    ]
    
    return separators.some(pattern => pattern.test(line))
  }

  /**
   * Detect field candidates from rows
   */
  private detectFieldCandidates(rows: RowData[]): FieldCandidate[] {
    const candidates: FieldCandidate[] = []

    rows.forEach((row, rowIndex) => {
      Object.entries(row.fields).forEach(([key, value]) => {
        const type = this.classifyValueType(value)
        const source = this.determineFieldSource(key, value)
        
        candidates.push({
          name: key,
          value,
          type,
          source,
          frequency: 1,
          attributes: {},
          domPath: `${row.domPath}.${key}`
        })
      })
    })

    return candidates
  }

  /**
   * Classify the type of a value
   */
  private classifyValueType(value: string): string {
    // URL patterns
    if (/^https?:\/\//.test(value) || /^www\./.test(value)) {
      return 'url'
    }
    
    // Email patterns
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return 'email'
    }
    
    // Phone patterns
    if (/^[\+]?[1-9][\d]{0,15}$/.test(value.replace(/[\s\-\(\)]/g, ''))) {
      return 'phone'
    }
    
    // Date patterns
    if (/^\d{4}-\d{2}-\d{2}/.test(value) || 
        /^\d{1,2}\/\d{1,2}\/\d{4}/.test(value) ||
        /^\d{1,2}\.\d{1,2}\.\d{4}/.test(value)) {
      return 'date'
    }
    
    // Currency patterns
    if (/^[\$€£¥₹]\s*\d+([.,]\d{2})?$/.test(value)) {
      return 'currency'
    }
    
    // Number patterns
    if (/^\d+$/.test(value)) {
      return 'integer'
    }
    
    if (/^\d+\.\d+$/.test(value)) {
      return 'float'
    }
    
    // Rating patterns (e.g., "4.5/5", "★★★★☆")
    if (/^\d+\.?\d*\s*\/\s*\d+$/.test(value) || /^[★☆]{1,5}$/.test(value)) {
      return 'rating'
    }
    
    // Image URL patterns
    if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(value)) {
      return 'image'
    }
    
    // Default to string
    return 'string'
  }

  /**
   * Determine the source/context of a field
   */
  private determineFieldSource(key: string, value: string): string {
    if (key.startsWith('link_')) return 'link'
    if (key.startsWith('url_')) return 'url'
    if (key.startsWith('image_')) return 'image'
    if (key.startsWith('bold_')) return 'emphasis'
    if (key.startsWith('italic_')) return 'emphasis'
    if (key.startsWith('code_')) return 'code'
    if (key.startsWith('text_')) return 'text'
    
    return 'unknown'
  }

  /**
   * Merge field candidates across rows
   */
  private mergeFieldCandidates(candidates: FieldCandidate[], totalRows: number): FieldCandidate[] {
    const fieldMap = new Map<string, FieldCandidate>()

    candidates.forEach(candidate => {
      const key = `${candidate.source}_${candidate.type}`
      
      if (fieldMap.has(key)) {
        const existing = fieldMap.get(key)!
        existing.frequency++
        existing.value = existing.value || candidate.value
      } else {
        fieldMap.set(key, { ...candidate })
      }
    })

    // Filter fields that appear in at least 60% of rows
    const minFrequency = Math.max(1, Math.floor(totalRows * 0.6))
    const merged = Array.from(fieldMap.values())
      .filter(field => field.frequency >= minFrequency)
      .sort((a, b) => b.frequency - a.frequency)

    return merged
  }

  /**
   * Infer types for merged fields
   */
  private inferFieldTypes(fields: FieldCandidate[]): FieldCandidate[] {
    return fields.map(field => {
      // Re-classify based on all values seen
      const type = this.classifyValueType(field.value)
      return { ...field, type }
    })
  }

  /**
   * Generate human-readable field names
   */
  private generateFieldNames(fields: FieldCandidate[], userInstructions?: string): FieldCandidate[] {
    return fields.map((field, index) => {
      let name = this.generateFieldName(field, userInstructions)
      
      // Ensure unique names
      let counter = 1
      const originalName = name
      while (fields.some(f => f.name === name && f !== field)) {
        name = `${originalName}_${counter}`
        counter++
      }

      return {
        ...field,
        name,
        sources: [field.source]
      }
    })
  }

  /**
   * Generate a human-readable field name
   */
  private generateFieldName(field: FieldCandidate, userInstructions?: string): string {
    // Check if the field name is already meaningful (from pattern matching)
    if (['title', 'author', 'points', 'comments', 'url', 'link'].includes(field.name)) {
      return field.name
    }

    // Try to extract meaningful name from user instructions
    if (userInstructions) {
      const instructionWords = userInstructions.toLowerCase().split(/\s+/)
      const fieldWords = field.value.toLowerCase().split(/\s+/)
      
      // Look for common words between instructions and field value
      const commonWords = instructionWords.filter(word => 
        fieldWords.some(fieldWord => fieldWord.includes(word) || word.includes(fieldWord))
      )
      
      if (commonWords.length > 0) {
        return this.toCamelCase(commonWords[0])
      }
    }

    // Generate name based on type and source
    const typeNames: Record<string, string> = {
      url: 'url',
      email: 'email',
      phone: 'phone',
      date: 'date',
      currency: 'price',
      integer: 'number',
      float: 'number',
      rating: 'rating',
      image: 'image',
      string: 'text'
    }

    const sourceNames: Record<string, string> = {
      link: 'link',
      url: 'url',
      image: 'image',
      emphasis: 'title',
      code: 'code',
      text: 'content',
      unknown: 'field'
    }

    const typeName = typeNames[field.type] || 'field'
    const sourceName = sourceNames[field.source] || 'field'
    
    // Combine type and source intelligently
    if (typeName === sourceName) {
      return typeName
    }
    
    if (field.type === 'string' && field.source === 'emphasis') {
      return 'title'
    }
    
    if (field.type === 'url' && field.source === 'link') {
      return 'link'
    }
    
    return `${sourceName}_${typeName}`
  }

  /**
   * Convert string to camelCase
   */
  private toCamelCase(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+(.)/g, (_, char) => char.toUpperCase())
  }

  /**
   * Build Zod schema from typed fields
   */
  private buildZodSchema(fields: FieldCandidate[]): z.ZodSchema<any> {
    const schemaObject: any = {}

    fields.forEach(field => {
      const fieldSchema = this.createFieldSchema(field)
      
      // Make field optional if it doesn't appear in all rows
      if (field.frequency < 10) { // Assuming 10+ rows for required fields
        schemaObject[field.name] = fieldSchema.optional()
      } else {
        schemaObject[field.name] = fieldSchema
      }
    })

    // Wrap in object with items array to satisfy AI SDK requirements
    return z.object({
      items: z.array(z.object(schemaObject)).max(100)
    })
  }

  /**
   * Create Zod schema for a single field
   */
  private createFieldSchema(field: FieldCandidate): z.ZodSchema<any> {
    switch (field.type) {
      case 'url':
        return z.string().url().optional()
      case 'email':
        return z.string().email().optional()
      case 'phone':
        return z.string().regex(/^[\+]?[1-9][\d]{0,15}$/).optional()
      case 'date':
        return z.string().datetime().optional()
      case 'currency':
        return z.string().regex(/^[\$€£¥₹]\s*\d+([.,]\d{2})?$/).optional()
      case 'integer':
        return z.number().int().optional()
      case 'float':
        return z.number().optional()
      case 'rating':
        return z.string().regex(/^\d+\.?\d*\s*\/\s*\d+$|^[★☆]{1,5}$/).optional()
      case 'image':
        return z.string().url().optional()
      default:
        return z.string().optional()
    }
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(rowCount: number, fieldCount: number): number {
    // Higher confidence with more rows and reasonable field count
    const rowScore = Math.min(rowCount / 10, 1) // Max confidence at 10+ rows
    const fieldScore = Math.min(fieldCount / 5, 1) // Max confidence at 5+ fields
    
    return (rowScore + fieldScore) / 2
  }

  /**
   * Create fallback schema when no data is detected
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
      fieldTypes: {
        title: 'string',
        content: 'string',
        url: 'url',
        timestamp: 'string'
      },
      fieldSources: {
        title: ['text'],
        content: ['text'],
        url: ['link'],
        timestamp: ['text']
      }
    }
  }
}
