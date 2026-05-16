import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import NiceModal from '@ebay/nice-modal-react'
import { ActionIcon, Divider, Flex, Text, Tooltip } from '@mantine/core'
import { IconArchive, IconFolderPlus, IconSearch } from '@tabler/icons-react'
import { useRouterState } from '@tanstack/react-router'
import type { MutableRefObject } from 'react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Virtuoso } from 'react-virtuoso'
import type { SessionMeta } from '@shared/types'
import { useSessionList } from '@/stores/chatStore'
import { useFolders } from '@/stores/folderStore'
import { reorderSessionsInContext } from '@/stores/sessionActions'
import { useUIStore } from '@/stores/uiStore'
import { getEffectiveFolderId } from '@/utils/folder-utils'
import FolderHeader from './FolderHeader'
import SessionItem from './SessionItem'

export interface Props {
  sessionListViewportRef: MutableRefObject<HTMLDivElement | null>
}

type ListItem =
  | { type: 'folder'; folderId: string }
  | { type: 'session'; session: SessionMeta; folderId?: string }
  | { type: 'separator' }

export default function SessionList(props: Props) {
  const { t } = useTranslation()
  const { sessionMetaList: sortedSessions } = useSessionList()
  const { folders } = useFolders()
  const setOpenSearchDialog = useUIStore((s) => s.setOpenSearchDialog)
  const [activeSession, setActiveSession] = useState<SessionMeta | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  const sensors = useSensors(
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 10 },
    }),
    useSensor(MouseSensor, {
      activationConstraint: { distance: 10 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }, [])

  const expandFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      if (prev.has(folderId)) return prev
      const next = new Set(prev)
      next.add(folderId)
      return next
    })
  }, [])

  const sortedFolders = useMemo(() => {
    if (!folders) return []
    return [...folders].sort((a, b) => a.name.localeCompare(b.name))
  }, [folders])

  const folderSessionsMap = useMemo(() => {
    const map = new Map<string, SessionMeta[]>()
    if (!sortedSessions || !sortedFolders) return map
    for (const f of sortedFolders) {
      map.set(f.id, [])
    }
    for (const session of sortedSessions) {
      const effectiveFolderId = getEffectiveFolderId(session, sortedFolders)
      if (effectiveFolderId && map.has(effectiveFolderId)) {
        map.get(effectiveFolderId)!.push(session)
      }
    }
    return map
  }, [sortedSessions, sortedFolders])

  const listItems = useMemo((): ListItem[] => {
    if (!sortedSessions) return []

    const items: ListItem[] = []

    for (const folder of sortedFolders) {
      items.push({ type: 'folder', folderId: folder.id })
      if (expandedFolders.has(folder.id)) {
        const folderSessions = folderSessionsMap.get(folder.id) ?? []
        for (const session of folderSessions) {
          items.push({ type: 'session', session, folderId: folder.id })
        }
      }
    }

    const uncategorized = sortedSessions.filter((s) => getEffectiveFolderId(s, sortedFolders) === null)

    // Add separator only if there are folders AND uncategorized sessions
    if (sortedFolders.length > 0 && uncategorized.length > 0) {
      items.push({ type: 'separator' })
    }

    for (const session of uncategorized) {
      items.push({ type: 'session', session })
    }

    return items
  }, [sortedSessions, sortedFolders, expandedFolders, folderSessionsMap])

  const allSessionIds = useMemo(
    () => listItems.filter((i) => i.type === 'session').map((i) => i.session!.id),
    [listItems]
  )

  const handleDragStart = (event: DragStartEvent) => {
    const session = sortedSessions?.find((s) => s.id === event.active.id)
    if (session) setActiveSession(session)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveSession(null)
    if (!event.over || !sortedSessions) return

    const activeId = event.active.id as string
    const overId = event.over.id as string

    if (activeId === overId) return

    const activeSession = sortedSessions.find((s) => s.id === activeId)
    const overSession = sortedSessions.find((s) => s.id === overId)

    if (!activeSession || !overSession) return

    const activeContext = getEffectiveFolderId(activeSession, sortedFolders)
    const overContext = getEffectiveFolderId(overSession, sortedFolders)

    // Only allow reordering within the same folder context
    if (activeContext !== overContext) return

    const contextSessions =
      activeContext === null
        ? sortedSessions.filter((s) => getEffectiveFolderId(s, sortedFolders) === null)
        : (folderSessionsMap.get(activeContext) ?? [])

    const oldIndex = contextSessions.findIndex((s) => s.id === activeId)
    const newIndex = contextSessions.findIndex((s) => s.id === overId)

    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
      await reorderSessionsInContext(activeContext, oldIndex, newIndex)
    }
  }

  const routerState = useRouterState()

  return (
    <>
      <Flex align="center" py="xs" px="md" gap="xs">
        <Text c="chatbox-tertiary" flex={1}>
          {t('Chat')}
        </Text>

        <Tooltip label={t('Search')} openDelay={1000} withArrow>
          <ActionIcon variant="subtle" color="chatbox-tertiary" size={20} onClick={() => setOpenSearchDialog(true, true)}>
            <IconSearch />
          </ActionIcon>
        </Tooltip>

        <Tooltip label={t('New Folder')} openDelay={1000} withArrow>
          <ActionIcon variant="subtle" color="chatbox-tertiary" size={20} onClick={() => NiceModal.show('folder-settings')}>
            <IconFolderPlus />
          </ActionIcon>
        </Tooltip>

        <Tooltip label={t('Clear Conversation List')} openDelay={1000} withArrow>
          <ActionIcon variant="subtle" color="chatbox-tertiary" size={20} onClick={() => NiceModal.show('clear-session-list')}>
            <IconArchive />
          </ActionIcon>
        </Tooltip>
      </Flex>

      <DndContext
        modifiers={[restrictToVerticalAxis]}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={allSessionIds} strategy={verticalListSortingStrategy}>
          <Virtuoso
            style={{ flex: 1 }}
            data={listItems}
            scrollerRef={(ref) => {
              if (ref instanceof HTMLDivElement) {
                props.sessionListViewportRef.current = ref
              }
            }}
            itemContent={(_index, item) => {
              if (item.type === 'folder' && item.folderId) {
                const folder = sortedFolders.find((f) => f.id === item.folderId)
                if (!folder) return null
                const sessionCount = folderSessionsMap.get(folder.id)?.length ?? 0
                const expanded = expandedFolders.has(folder.id)
                return (
                  <FolderHeader
                    folder={folder}
                    sessionCount={sessionCount}
                    expanded={expanded}
                    onToggle={() => toggleFolder(folder.id)}
                    onNewChat={() => expandFolder(folder.id)}
                  />
                )
              }

              if (item.type === 'session' && item.session) {
                return (
                  <SortableItem id={item.session.id}>
                    <SessionItem
                      selected={routerState.location.pathname === `/session/${item.session.id}`}
                      session={item.session}
                    />
                  </SortableItem>
                )
              }

              if (item.type === 'separator') {
                return <Divider my="xs" mx="md" />
              }

              return null
            }}
          />
        </SortableContext>

        <DragOverlay>
          {activeSession && <SessionItem selected={false} session={activeSession} />}
        </DragOverlay>
      </DndContext>
    </>
  )
}

function SortableItem(props: { id: string; children?: React.ReactNode }) {
  const { id, children } = props
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    animateLayoutChanges: () => false,
  })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? transition : undefined,
        opacity: isDragging ? 0 : undefined,
      }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  )
}


