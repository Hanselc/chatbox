import NiceModal from '@ebay/nice-modal-react'
import { ActionIcon, Flex, Text } from '@mantine/core'
import type { ChatFolder } from '@shared/types'
import type { TablerIcon } from '@tabler/icons-react'
import {
  IconChevronDown,
  IconChevronRight,
  IconCirclePlus,
  IconDots,
  IconEdit,
  IconFolder,
  IconTrash,
} from '@tabler/icons-react'
import * as TablerIcons from '@tabler/icons-react'
import { memo, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createEmpty } from '@/stores/sessionActions'
import ActionMenu, { type ActionMenuItemProps } from '../ActionMenu'
import { ScalableIcon } from '../common/ScalableIcon'

export interface FolderHeaderProps {
  folder: ChatFolder
  sessionCount: number
  expanded: boolean
  onToggle: () => void
  onNewChat?: () => void
}

function FolderHeader({ folder, sessionCount, expanded, onToggle, onNewChat }: FolderHeaderProps) {
  const { t } = useTranslation()
  const [menuOpened, setMenuOpened] = useState(false)

  // Dynamically get the folder icon component
  const FolderIcon = useMemo(() => {
    if (folder.icon && folder.icon in TablerIcons) {
      return TablerIcons[folder.icon as keyof typeof TablerIcons] as TablerIcon
    }
    return IconFolder
  }, [folder.icon])

  // Get folder color (fallback to brand color)
  const folderColor = folder.color || 'var(--chatbox-tint-brand)'

  const actionMenuItems = useMemo<ActionMenuItemProps[]>(
    () => [
      {
        text: t('New Chat'),
        icon: IconCirclePlus,
        onClick: () => {
          createEmpty('chat', folder.id)
          onNewChat?.()
        },
      },
      {
        text: t('Edit'),
        icon: IconEdit,
        onClick: () => {
          NiceModal.show('folder-settings', { folder })
        },
      },
      { divider: true },
      {
        text: t('Delete'),
        icon: IconTrash,
        onClick: () => {
          NiceModal.show('delete-folder', { folder })
        },
      },
    ],
    [folder, t]
  )

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onToggle()
  }

  return (
    <Flex
      align="center"
      className="cursor-pointer rounded-sm hover:bg-chatbox-background-gray-secondary group/folder-header"
      mx="xs"
      px="xs"
      py={8}
      gap={6}
    >
      <Flex align="center" gap={6} flex={1} onClick={handleToggle}>
        <ScalableIcon
          icon={expanded ? IconChevronDown : IconChevronRight}
          size={14}
          className="text-chatbox-tertiary flex-shrink-0"
        />

        <ScalableIcon icon={FolderIcon} size={16} style={{ color: folderColor }} className="flex-shrink-0" />

        <Text span flex={1} lineClamp={1} c="chatbox-primary" size="sm" fw={500}>
          {folder.name}
        </Text>

        <Text span c="chatbox-tertiary" size="xs">
          {sessionCount}
        </Text>
      </Flex>

      <ActionMenu
        type="auto"
        items={actionMenuItems}
        position="bottom-start"
        opened={menuOpened}
        onChange={(opened) => setMenuOpened(opened)}
      >
        <ActionIcon
          variant="transparent"
          size={18}
          color="chatbox-tertiary"
          className={menuOpened ? '' : 'group-hover/folder-header:visible invisible'}
          onClick={(event) => {
            event.stopPropagation()
          }}
        >
          <ScalableIcon icon={IconDots} className="text-inherit" size={14} />
        </ActionIcon>
      </ActionMenu>
    </Flex>
  )
}

export default memo(FolderHeader)
