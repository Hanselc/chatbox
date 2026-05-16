import type { ChatFolder, SessionMeta } from '@shared/types'

/**
 * Determine the effective folder ID for a session.
 * A session belongs to a folder ONLY if its folderId is set AND the folder exists.
 * Otherwise, it is treated as uncategorized (returns null).
 *
 * This is the single source of truth for folder membership checks.
 * Use this everywhere instead of ad-hoc `folderId` checks.
 */
export function getEffectiveFolderId(session: SessionMeta, folders: ChatFolder[]): string | null {
  if (!session.folderId) return null
  const folderExists = folders.some((f) => f.id === session.folderId)
  return folderExists ? session.folderId : null
}
