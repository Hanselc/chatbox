const SEPARATOR = '\n\n---\n\n'

/**
 * Build a single combined system instruction from three levels:
 *   Global → Folder → Chat
 *
 * Empty sections are omitted.
 * When `ignoreGlobal` is true the global section is skipped
 * (folder + chat are always included).
 */
export function buildCombinedInstruction(opts: {
  globalPrompt: string
  folderInstruction: string
  chatInstruction: string
  ignoreGlobal: boolean
}): string {
  const parts: string[] = []

  if (!opts.ignoreGlobal) {
    const trimmed = opts.globalPrompt.trim()
    if (trimmed) parts.push(trimmed)
  }

  const folderTrimmed = opts.folderInstruction.trim()
  if (folderTrimmed) parts.push(folderTrimmed)

  const chatTrimmed = opts.chatInstruction.trim()
  if (chatTrimmed) parts.push(chatTrimmed)

  if (parts.length === 0) return ''
  return parts.join(SEPARATOR)
}
