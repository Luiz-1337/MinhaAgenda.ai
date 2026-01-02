import pdfParse from "pdf-parse"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const DEFAULT_CHUNK_SIZE = 1000
const CHUNK_OVERLAP = 100

export type FileType = "pdf" | "txt"

export interface FileProcessingResult {
  text: string
  fileType: FileType
  fileName: string
}

/**
 * Valida o tipo e tamanho do arquivo
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
  const allowedTypes = ["application/pdf", "text/plain"]
  const allowedExtensions = [".pdf", ".txt"]

  // Verifica tipo MIME
  if (!allowedTypes.includes(file.type)) {
    // Fallback: verifica extensão
    const extension = file.name.toLowerCase().slice(file.name.lastIndexOf("."))
    if (!allowedExtensions.includes(extension)) {
      return {
        valid: false,
        error: "Tipo de arquivo não suportado. Use arquivos .pdf ou .txt",
      }
    }
  }

  // Verifica tamanho
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `Arquivo muito grande. Tamanho máximo: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    }
  }

  return { valid: true }
}

/**
 * Detecta o tipo de arquivo baseado no nome e tipo MIME
 */
export function detectFileType(file: File): FileType {
  const extension = file.name.toLowerCase().slice(file.name.lastIndexOf("."))
  if (extension === ".pdf" || file.type === "application/pdf") {
    return "pdf"
  }
  return "txt"
}

/**
 * Extrai texto de um arquivo PDF
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(buffer)
    return data.text || ""
  } catch (error) {
    throw new Error(
      `Erro ao extrair texto do PDF: ${error instanceof Error ? error.message : "Erro desconhecido"}`
    )
  }
}

/**
 * Extrai texto de um arquivo TXT
 */
export async function extractTextFromTXT(buffer: Buffer): Promise<string> {
  try {
    // Tenta diferentes encodings
    const text = buffer.toString("utf-8")
    return text
  } catch (error) {
    throw new Error(
      `Erro ao extrair texto do arquivo: ${error instanceof Error ? error.message : "Erro desconhecido"}`
    )
  }
}

/**
 * Extrai texto de um arquivo (PDF ou TXT)
 */
export async function extractTextFromFile(file: File): Promise<FileProcessingResult> {
  const validation = validateFile(file)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  const fileType = detectFileType(file)
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  let text: string

  if (fileType === "pdf") {
    text = await extractTextFromPDF(buffer)
  } else {
    text = await extractTextFromTXT(buffer)
  }

  // Remove espaços em branco excessivos e normaliza
  text = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  if (!text || text.length === 0) {
    throw new Error("Nenhum texto foi encontrado no arquivo")
  }

  return {
    text,
    fileType,
    fileName: file.name,
  }
}

/**
 * Divide texto em chunks inteligentes preservando contexto
 */
export function splitIntelligentChunks(
  text: string,
  maxChunkSize: number = DEFAULT_CHUNK_SIZE
): string[] {
  if (text.length <= maxChunkSize) {
    return [text]
  }

  const chunks: string[] = []
  let currentIndex = 0

  while (currentIndex < text.length) {
    const remainingText = text.slice(currentIndex)
    const targetEnd = currentIndex + maxChunkSize

    if (targetEnd >= text.length) {
      // Último chunk - pega o restante
      chunks.push(remainingText.trim())
      break
    }

    // Tenta encontrar um ponto de quebra ideal
    // Prioridade: parágrafo > frase > espaço
    let breakPoint = targetEnd

    // Procura por quebra de parágrafo (duas quebras de linha)
    const searchWindow = remainingText.slice(0, maxChunkSize - CHUNK_OVERLAP)
    const paragraphBreak = searchWindow.lastIndexOf("\n\n")
    if (paragraphBreak > maxChunkSize * 0.5) {
      // Se encontrou um parágrafo em pelo menos 50% do chunk, usa ele
      breakPoint = currentIndex + paragraphBreak + 2
    } else {
      // Procura por fim de frase (., !, ? seguido de espaço)
      const sentenceRegex = /[.!?]\s/g
      let sentenceEnd = -1
      let match: RegExpExecArray | null
      while ((match = sentenceRegex.exec(searchWindow)) !== null) {
        sentenceEnd = match.index + 2
      }
      
      if (sentenceEnd > maxChunkSize * 0.5) {
        breakPoint = currentIndex + sentenceEnd
      } else {
        // Último recurso: quebra em espaço
        const spaceBreak = searchWindow.lastIndexOf(" ")
        if (spaceBreak > maxChunkSize * 0.5) {
          breakPoint = currentIndex + spaceBreak + 1
        }
      }
    }

    // Garante que não ultrapassou o limite
    if (breakPoint > currentIndex + maxChunkSize) {
      breakPoint = currentIndex + maxChunkSize
    }

    // Extrai o chunk
    let chunk = text.slice(currentIndex, breakPoint).trim()

    // Adiciona overlap do chunk anterior se não for o primeiro
    if (chunks.length > 0 && currentIndex > 0) {
      const overlapStart = Math.max(0, currentIndex - CHUNK_OVERLAP)
      const overlapText = text.slice(overlapStart, currentIndex).trim()
      if (overlapText) {
        chunk = overlapText + " " + chunk
      }
    }

    if (chunk) {
      chunks.push(chunk)
    }

    // Move o índice para o próximo chunk (com overlap)
    currentIndex = breakPoint - CHUNK_OVERLAP
    if (currentIndex <= 0) {
      // Previne loop infinito
      currentIndex = breakPoint
    }
  }

  return chunks.filter((chunk) => chunk.length > 0)
}
