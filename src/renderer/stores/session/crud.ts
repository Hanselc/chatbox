import { arrayMove } from '@dnd-kit/sortable'
import { copyMessagesWithMapping, copyThreads, createMessage, type Session, type SessionMeta } from '@shared/types'
import { getMessageText } from '@shared/utils/message'
import { getDefaultStore } from 'jotai'
import { omit } from 'lodash'
import { router } from '@/router'
import { buildCombinedInstruction } from '@/utils/system-instruction'
import { sortSessions } from '@/utils/session-utils'
import * as atoms from '../atoms'
import * as chatStore from '../chatStore'
import { getFolderById } from '../folderStore'
import { settingsStore } from '../settingsStore'
import * as scrollActions from '../scrollActions'
import { initEmptyChatSession, initEmptyPictureSession } from '../sessionHelpers'

/**
 * Build the single combined system instruction for a session before persisting.
 */
async function _buildSessionSystemInstruction(session: Omit<Session, 'id'>): Promise<string> {
  const settings = settingsStore.getState().getSettings()
  const globalPrompt = settings.defaultPrompt?.trim() || ''

  let folderInstruction = ''
  let ignoreGlobal = false
  if (session.folderId) {
    const folder = await getFolderById(session.folderId)
    if (folder) {
      folderInstruction = folder.systemInstruction
      ignoreGlobal = folder.ignoreOtherInstructions
    }
  }

  return buildCombinedInstruction({
    globalPrompt,
    folderInstruction,
    chatInstruction: session.systemInstruction?.trim() || '',
    ignoreGlobal,
  })
}

/**
 * Create a new session. For chat sessions, builds the combined system
 * instruction (global + folder + chat) and prepends it as a system message,
 * preserving any existing system message text as part of the chat instruction.
 * Picture sessions are left untouched.
 */
export async function create(newSession: Omit<Session, 'id'>) {
  if (newSession.type === 'chat' || newSession.type === undefined) {
    const nonSystemMessages = newSession.messages.filter((m) => m.role !== 'system')
    const existingSystemTexts = newSession.messages
      .filter((m) => m.role === 'system')
      .map((m) => getMessageText(m))
      .filter(Boolean)

    const chatInstruction = [newSession.systemInstruction?.trim() || '', ...existingSystemTexts]
      .filter(Boolean)
      .join('\n\n---\n\n')

    const combined = await _buildSessionSystemInstruction({
      ...newSession,
      systemInstruction: chatInstruction,
    })

    if (combined) {
      const sysMsg = createMessage('system', combined)
      sysMsg.timestamp = 0
      newSession = { ...newSession, messages: [sysMsg, ...nonSystemMessages] }
    } else {
      newSession = { ...newSession, messages: nonSystemMessages }
    }
  }

  const session = await chatStore.createSession(newSession)
  return session
}

/**
 * Create a new empty session and switch to it
 */
export async function createEmpty(type: 'chat' | 'picture', folderId?: string) {
  let newSession: Session
  switch (type) {
    case 'chat':
      newSession = await create(initEmptyChatSession(folderId))
      break
    case 'picture':
      newSession = await create(initEmptyPictureSession())
      break
    default:
      throw new Error(`Unknown session type: ${type}`)
  }
  switchCurrentSession(newSession.id)
  return newSession
}

/**
 * Copy a session (internal helper)
 */
async function copySession(
  sourceMeta: SessionMeta & {
    name?: Session['name']
    messages?: Session['messages']
    threads?: Session['threads']
    threadName?: Session['threadName']
    compactionPoints?: Session['compactionPoints']
  }
) {
  const source = await chatStore.getSession(sourceMeta.id)
  if (!source) {
    throw new Error(`Session ${sourceMeta.id} not found`)
  }

  // Copy messages and get ID mapping
  const { messages: newMessages, idMapping } = sourceMeta.messages
    ? copyMessagesWithMapping(sourceMeta.messages)
    : copyMessagesWithMapping(source.messages)

  // Use sourceMeta.compactionPoints if explicitly provided (e.g., from thread),
  // otherwise fall back to source session's compactionPoints
  const sourceCompactionPoints =
    'compactionPoints' in sourceMeta ? sourceMeta.compactionPoints : source.compactionPoints

  // Map compactionPoints IDs
  const newCompactionPoints = sourceCompactionPoints
    ?.map((cp) => {
      const newSummaryId = idMapping.get(cp.summaryMessageId)
      const newBoundaryId = idMapping.get(cp.boundaryMessageId)
      if (!newSummaryId || !newBoundaryId) {
        console.warn('[copySession] Skipping compactionPoint with unmapped IDs', cp)
        return null
      }
      return {
        ...cp,
        summaryMessageId: newSummaryId,
        boundaryMessageId: newBoundaryId,
      }
    })
    .filter((cp): cp is NonNullable<typeof cp> => cp !== null)

  const newSession = {
    ...omit(source, 'id', 'messages', 'threads', 'messageForksHash', 'compactionPoints'),
    ...(sourceMeta.name ? { name: sourceMeta.name } : {}),
    messages: newMessages,
    threads: sourceMeta.threads ? copyThreads(sourceMeta.threads, idMapping) : copyThreads(source.threads, idMapping),
    messageForksHash: undefined,
    compactionPoints: newCompactionPoints?.length ? newCompactionPoints : undefined,
    ...(sourceMeta.threadName ? { threadName: sourceMeta.threadName } : {}),
  }
  return await chatStore.createSession(newSession, source.id)
}

/**
 * Copy session and switch to it
 */
export async function copyAndSwitchSession(source: SessionMeta) {
  const newSession = await copySession(source)
  switchCurrentSession(newSession.id)
}

/**
 * Switch current session by id
 */
export function switchCurrentSession(sessionId: string) {
  const store = getDefaultStore()
  store.set(atoms.currentSessionIdAtom, sessionId)
  router.navigate({
    to: `/session/${sessionId}`,
  })
  scrollActions.clearAutoScroll()
}

/**
 * Reorder sessions within a specific folder context (or uncategorized).
 * Only changes the relative order of sessions in the same context;
 * sessions in other folders are left untouched.
 *
 * Updates sortOrder on the affected sessions so the new order is persisted
 * independently of the raw array position.
 */
export async function reorderSessionsInContext(
  folderId: string | null,
  oldIndex: number,
  newIndex: number
) {
  console.debug('sessionActions', 'reorderSessionsInContext', { folderId, oldIndex, newIndex })

  await chatStore.updateSessionList((sessions) => {
    if (!sessions) {
      throw new Error('Session list not found')
    }

    const isInContext = (s: SessionMeta) => {
      if (s.hidden) return false
      return folderId === null ? !s.folderId : s.folderId === folderId
    }

    // Build the sorted view of the target context (same as the UI)
    const contextSessions = sortSessions(sessions.filter(isInContext))

    if (
      oldIndex < 0 ||
      newIndex < 0 ||
      oldIndex >= contextSessions.length ||
      newIndex >= contextSessions.length
    ) {
      return sessions
    }

    // Reorder within the context
    const reordered = arrayMove(contextSessions, oldIndex, newIndex)

    // Recompute sortOrder values for the reordered context sessions.
    // Higher sortOrder = earlier in the list (sortSessions sorts descending).
    const base = Date.now() + 100000
    const reorderedWithSortOrder = reordered.map((s, i) => ({
      ...s,
      sortOrder: base - i,
    }))

    // Replace context sessions in the full list, preserving everything else
    const contextIds = new Set(reorderedWithSortOrder.map((s) => s.id))
    let contextIdx = 0
    return sessions.map((s) => {
      if (contextIds.has(s.id)) {
        return reorderedWithSortOrder[contextIdx++]!
      }
      return s
    })
  })
}

/**
 * Switch to session by sorted index
 */
export async function switchToIndex(index: number) {
  const sessions = await chatStore.listSessionsMeta()
  const target = sessions[index]
  if (!target) {
    return
  }
  switchCurrentSession(target.id)
}

/**
 * Switch to next/previous session in sorted order
 */
export async function switchToNext(reversed?: boolean) {
  const sessions = await chatStore.listSessionsMeta()
  if (!sessions) {
    return
  }
  const store = getDefaultStore()
  const currentSessionId = store.get(atoms.currentSessionIdAtom)
  const currentIndex = sessions.findIndex((s) => s.id === currentSessionId)
  if (currentIndex < 0) {
    switchCurrentSession(sessions[0].id)
    return
  }
  let targetIndex = reversed ? currentIndex - 1 : currentIndex + 1
  if (targetIndex >= sessions.length) {
    targetIndex = 0
  }
  if (targetIndex < 0) {
    targetIndex = sessions.length - 1
  }
  const target = sessions[targetIndex]
  switchCurrentSession(target.id)
}

/**
 * Clear session list, keeping only specified number of sessions
 */
async function clearSessionList(keepNum: number) {
  const sessionMetaList = await chatStore.listSessionsMeta()
  const deleted = sessionMetaList?.slice(keepNum)
  if (!deleted?.length) {
    return
  }
  for (const s of deleted) {
    await chatStore.deleteSession(s.id)
  }
  await chatStore.updateSessionList((sessions) => {
    if (!sessions) {
      throw new Error('Session list not found')
    }
    return sessions.filter((s) => !deleted?.some((d) => d.id === s.id))
  })

  // Navigate to home if the current session was deleted
  const store = getDefaultStore()
  const currentSessionId = store.get(atoms.currentSessionIdAtom)
  if (currentSessionId && deleted.some((d) => d.id === currentSessionId)) {
    router.navigate({ to: '/', replace: true })
  }
}

/**
 * Clear conversation list, keeping only specified number of sessions (from top)
 */
export async function clearConversationList(keepNum: number) {
  await clearSessionList(keepNum)
}

/**
 * Clear all messages in a session, keeping only system prompt
 */
export async function clear(sessionId: string) {
  const session = await chatStore.getSession(sessionId)
  if (!session) {
    return
  }
  session.messages.forEach((msg) => {
    msg?.cancel?.()
  })
  return await chatStore.updateSessionWithMessages(session.id, {
    messages: session.messages.filter((m) => m.role === 'system').slice(0, 1),
    threads: undefined,
  })
}

// Re-export copySession for use by threads.ts (moveThreadToConversations)
export { copySession as _copySession }
