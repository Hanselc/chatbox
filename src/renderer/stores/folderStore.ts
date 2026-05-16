import type { ChatFolder, Session, SessionMeta, Updater, UpdaterFn } from '@shared/types'
import { createMessage } from '@shared/types'
import { useQuery } from '@tanstack/react-query'
import { v4 as uuidv4 } from 'uuid'
import storage, { StorageKey } from '@/storage'
import { StorageKeyGenerator } from '@/storage/StoreStorage'
import { buildCombinedInstruction } from '@/utils/system-instruction'
import { getLogger } from '../lib/utils'
import queryClient from './queryClient'
import { UpdateQueue } from './updateQueue'
import { deleteSession, getSession, listSessionsMeta, updateSessionList, updateSessionWithMessages } from './chatStore'
import { getSessionMeta } from './sessionHelpers'
import { settingsStore } from './settingsStore'

const log = getLogger('folder-store')

const QueryKeys = {
  ChatFoldersList: ['chat-folders-list'],
}

async function _listFolders(): Promise<ChatFolder[]> {
  try {
    return await storage.getItem<ChatFolder[]>(StorageKey.ChatFolders, [])
  } catch (error) {
    log.error('Failed to read folders list from storage:', error)
    throw error
  }
}

const listFoldersQueryOptions = {
  queryKey: QueryKeys.ChatFoldersList,
  queryFn: _listFolders,
  staleTime: Infinity,
}

export async function listFolders() {
  return await queryClient.fetchQuery(listFoldersQueryOptions)
}

export function useFolders() {
  const { data: folders, refetch } = useQuery({ ...listFoldersQueryOptions })
  return { folders, refetch }
}

let folderUpdateQueue: UpdateQueue<ChatFolder[]> | null = null

export async function updateFoldersList(updater: UpdaterFn<ChatFolder[]>) {
  if (!folderUpdateQueue) {
    folderUpdateQueue = new UpdateQueue<ChatFolder[]>(
      () => _listFolders(),
      async (folders) => {
        await storage.setItemNow(StorageKey.ChatFolders, folders)
      }
    )
  }
  const result = await folderUpdateQueue.set(updater)
  queryClient.setQueryData(QueryKeys.ChatFoldersList, result)
  return result
}

export async function createFolder(
  name: string,
  systemInstruction: string = '',
  ignoreOtherInstructions: boolean = false,
  icon?: string,
  color?: string
): Promise<ChatFolder> {
  const folder: ChatFolder = {
    id: uuidv4(),
    name: name.trim() || 'New Folder',
    systemInstruction,
    ignoreOtherInstructions,
    icon,
    color,
    createdAt: Date.now(),
    sortOrder: Date.now(),
  }
  await updateFoldersList((folders) => {
    if (!folders) {
      throw new Error('Folders list not found')
    }
    return [...folders, folder]
  })
  return folder
}

export async function updateFolder(folderId: string, updater: Updater<ChatFolder>) {
  return await updateFoldersList((folders) => {
    if (!folders) {
      throw new Error('Folders list not found')
    }
    return folders.map((f) => {
      if (f.id !== folderId) return f
      const updated = typeof updater === 'function' ? updater(f) : { ...f, ...updater }
      return updated
    })
  })
}

export async function deleteFolder(folderId: string, deleteChats = false) {
  const sessions = await storage.getItem<any[]>(StorageKey.ChatSessionsList, [])

  for (const meta of sessions) {
    if (meta.folderId !== folderId) continue
    try {
      if (deleteChats) {
        await deleteSession(meta.id)
      } else {
        const session = await getSession(meta.id)
        if (session) {
          // Rebuild combined instruction without the folder part
          const settings = settingsStore.getState().getSettings()
          const combined = buildCombinedInstruction({
            globalPrompt: settings.defaultPrompt?.trim() || '',
            folderInstruction: '',
            chatInstruction: session.systemInstruction?.trim() || '',
            ignoreGlobal: false,
          })
          const nonSystemMessages = session.messages.filter((m) => m.role !== 'system')
          const updated: Session = {
            ...session,
            folderId: undefined,
            messages: combined
              ? [Object.assign(createMessage('system', combined), { timestamp: 0 }), ...nonSystemMessages]
              : nonSystemMessages,
          }
          await storage.setItemNow(StorageKeyGenerator.session(meta.id), updated)
          queryClient.setQueryData(['chat-session', meta.id], updated)
          await updateSessionList((list) => {
            if (!list) throw new Error('Session list not found')
            return list.map((s) => (s.id === meta.id ? getSessionMeta(updated) : s))
          })
        }
      }
    } catch (e) {
      log.error(`Failed to process session ${meta.id} during folder deletion:`, e)
    }
  }

  await updateFoldersList((folders) => {
    if (!folders) {
      throw new Error('Folders list not found')
    }
    return folders.filter((f) => f.id !== folderId)
  })
}

export async function getFolderById(folderId: string): Promise<ChatFolder | undefined> {
  const folders = await listFolders()
  return folders?.find((f) => f.id === folderId)
}

export async function moveSessionToFolder(sessionId: string, newFolderId: string | null) {
  const session = await getSession(sessionId)
  if (!session) {
    throw new Error(`Session ${sessionId} not found`)
  }

  // Get the new folder if moving to one
  let folderInstruction = ''
  let ignoreGlobal = false
  if (newFolderId) {
    const folder = await getFolderById(newFolderId)
    if (folder) {
      folderInstruction = folder.systemInstruction?.trim() || ''
      ignoreGlobal = folder.ignoreOtherInstructions
    }
  }

  // Get global prompt from settings
  const settings = settingsStore.getState().getSettings()
  const globalPrompt = settings.defaultPrompt?.trim() || ''

  // Build the combined system instruction with the new folder context
  const combined = buildCombinedInstruction({
    globalPrompt,
    folderInstruction,
    chatInstruction: session.systemInstruction?.trim() || '',
    ignoreGlobal,
  })

  // Rebuild messages array with the new combined instruction
  const nonSystemMessages = session.messages.filter((m) => m.role !== 'system')
  const updated: Session = {
    ...session,
    folderId: newFolderId ?? undefined,
    messages: combined
      ? [Object.assign(createMessage('system', combined), { timestamp: 0 }), ...nonSystemMessages]
      : nonSystemMessages,
  }

  // Persist the updated session
  await updateSessionWithMessages(sessionId, updated)
}

export async function updateFolderInstructionsOnAllSessions(folderId: string, newInstruction: string) {
  const sessions = await storage.getItem<any[]>(StorageKey.ChatSessionsList, [])
  const allFolders = await listFolders()
  const folder = allFolders?.find((f) => f.id === folderId)
  if (!folder) return

  const settings = settingsStore.getState().getSettings()
  const globalPrompt = settings.defaultPrompt?.trim() || ''

  for (const meta of sessions) {
    if (meta.folderId !== folderId) continue

    try {
      const session = await getSession(meta.id)
      if (!session) continue

      const combined = buildCombinedInstruction({
        globalPrompt,
        folderInstruction: newInstruction,
        chatInstruction: session.systemInstruction?.trim() || '',
        ignoreGlobal: folder.ignoreOtherInstructions,
      })

      const nonSystemMessages = session.messages.filter((m) => m.role !== 'system')
      const updated: Session = {
        ...session,
        messages: combined
          ? [Object.assign(createMessage('system', combined), { timestamp: 0 }), ...nonSystemMessages]
          : nonSystemMessages,
      }

      await updateSessionWithMessages(meta.id, updated)
    } catch (e) {
      log.error(`Failed to update folder instructions on session ${meta.id}:`, e)
    }
  }
}

/**
 * Rebuild the combined system instruction for every session.
 * Used when the global default prompt changes.
 * Returns counts of updated / failed sessions.
 */
export async function rebuildAllSessionsSystemInstruction(): Promise<{ updated: number; failed: number }> {
  const sessionsMeta = await listSessionsMeta()
  const allFolders = await listFolders()
  const settings = settingsStore.getState().getSettings()
  const globalPrompt = settings.defaultPrompt?.trim() || ''

  let updated = 0
  let failed = 0

  for (const meta of sessionsMeta) {
    try {
      const session = await getSession(meta.id)
      if (!session) continue

      const folder = meta.folderId ? allFolders?.find((f) => f.id === meta.folderId) : undefined
      const combined = buildCombinedInstruction({
        globalPrompt,
        folderInstruction: folder?.systemInstruction || '',
        chatInstruction: session.systemInstruction?.trim() || '',
        ignoreGlobal: folder?.ignoreOtherInstructions || false,
      })

      const nonSystemMessages = session.messages.filter((m) => m.role !== 'system')
      const updatedSession: Session = {
        ...session,
        messages: combined
          ? [Object.assign(createMessage('system', combined), { timestamp: 0 }), ...nonSystemMessages]
          : nonSystemMessages,
      }

      await updateSessionWithMessages(meta.id, updatedSession)
      updated++
    } catch (e) {
      log.error(`Failed to rebuild system instruction for session ${meta.id}:`, e)
      failed++
    }
  }

  return { updated, failed }
}
