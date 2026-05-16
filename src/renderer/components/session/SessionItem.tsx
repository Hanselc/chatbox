import NiceModal from '@ebay/nice-modal-react'
import { ActionIcon, Flex, Menu, Text } from '@mantine/core'
import type { SessionMeta } from '@shared/types'
import { IconCopy, IconDots, IconEdit, IconFolder, IconStar, IconStarFilled, IconTrash } from '@tabler/icons-react'
import clsx from 'clsx'
import { memo, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import { router } from '@/router'
import {
  deleteSession as deleteSessionStore,
  getSession,
  updateSession as updateSessionStore,
} from '@/stores/chatStore'
import { copyAndSwitchSession, switchCurrentSession } from '@/stores/sessionActions'
import { useFolders } from '@/stores/folderStore'
import { useUIStore } from '@/stores/uiStore'
import { getEffectiveFolderId } from '@/utils/folder-utils'
import type { ActionMenuItemProps } from '../ActionMenu'
import { AssistantAvatar } from '../common/Avatar'
import { ScalableIcon } from '../common/ScalableIcon'

export interface Props {
  session: SessionMeta
  selected: boolean
}

function SessionItem(props: Props) {
  const { session, selected } = props
  const { t } = useTranslation()
  const { folders } = useFolders()
  const setShowSidebar = useUIStore((s) => s.setShowSidebar)
  const onClick = () => {
    switchCurrentSession(session.id)
    if (isSmallScreen) {
      setShowSidebar(false)
    }
  }
  const isSmallScreen = useIsSmallScreen()

  const [menuOpened, setMenuOpened] = useState(false)

  const actionMenuItems = useMemo<ActionMenuItemProps[]>(
    () => [
      {
        text: t('Edit'),
        icon: IconEdit,
        onClick: async () => {
          await NiceModal.show('session-settings', {
            session: await getSession(session.id),
          })
        },
      },
      {
        text: t('Copy'),
        icon: IconCopy,
        onClick: () => {
          copyAndSwitchSession(session)
        },
      },
      {
        text: session.starred ? t('Unstar') : t('Star'),
        icon: session.starred ? IconStarFilled : IconStar,
        onClick: () => {
          void updateSessionStore(session.id, (s) => {
            if (!s) {
              throw new Error(`Session ${session.id} not found`)
            }
            return { ...s, starred: !s?.starred }
          })
        },
      },
    ],
    [session, t]
  )

  const deleteItem = useMemo<ActionMenuItemProps>(
    () => ({
      doubleCheck: true,
      text: t('Delete'),
      icon: IconTrash,
      onClick: async () => {
        try {
          await deleteSessionStore(session.id)
          if (selected) {
            router.navigate({ to: '/', replace: true })
          }
        } catch (error) {
          console.error('Failed to delete session:', error)
        }
      },
    }),
    [session, t]
  )

  const effectiveFolderId = useMemo(() => {
    return getEffectiveFolderId(session, folders ?? [])
  }, [session, folders])

  const effectiveFolder = useMemo(() => {
    return folders?.find((f) => f.id === effectiveFolderId)
  }, [folders, effectiveFolderId])

  const isInFolder = !!effectiveFolderId

  // Get folder color for the left border (fallback to brand color)
  const folderColor = effectiveFolder?.color || 'var(--chatbox-border-brand)'

  return (
    <Flex
      align="center"
      className={clsx(
        'cursor-pointer group/session-item',
        isInFolder ? 'rounded-l-none rounded-r-sm' : 'rounded-sm',
        isSmallScreen
          ? ''
          : selected
            ? 'bg-chatbox-background-brand-secondary'
            : 'hover:bg-chatbox-background-gray-secondary'
      )}
      mx="xs"
      px="xs"
      pl={isInFolder ? 'sm' : 'xs'}
      py={10}
      gap={10}
      onClick={onClick}
      style={isInFolder ? { borderLeft: `3px solid ${folderColor}` } : undefined}
    >
      <AssistantAvatar
        avatarKey={session.assistantAvatarKey}
        picUrl={session.picUrl}
        sessionType={session.type}
        size="sm"
        type="chat"
        c={selected ? 'chatbox-brand' : 'chatbox-primary'}
      />

      <Text span flex={1} lineClamp={1} c={selected ? 'chatbox-brand' : 'chatbox-primary'}>
        {session.name}
      </Text>

      <Menu position="bottom-end" withinPortal opened={menuOpened} onChange={setMenuOpened}>
        <Menu.Target>
          <ActionIcon
            variant="transparent"
            size={20}
            color={session.starred ? 'chatbox-brand' : 'chatbox-tertiary'}
            className={isSmallScreen || session.starred || menuOpened ? '' : 'group-hover/session-item:visible invisible'}
            onClick={(event) => {
              event.stopPropagation()
              event.preventDefault()
            }}
          >
            {session.starred ? (
              <ScalableIcon icon={IconStarFilled} className="text-inherit" size={16} />
            ) : (
              <ScalableIcon icon={IconDots} className="text-inherit" size={16} />
            )}
          </ActionIcon>
        </Menu.Target>

        <Menu.Dropdown miw={160} onClick={(e) => e.stopPropagation()}>
          {actionMenuItems.map((item: any) => (
            <Menu.Item
              key={item.text}
              leftSection={item.icon ? <item.icon size={14} /> : undefined}
              onClick={item.onClick}
            >
              {item.text}
            </Menu.Item>
          ))}

          <Menu.Divider />

          <Menu.Item
            leftSection={<IconFolder size={14} />}
            onClick={() => {
              void NiceModal.show('move-session-to-folder', { session })
            }}
          >
            {t('Move to Folder')}
          </Menu.Item>

          <Menu.Divider />

          <Menu.Item
            color="chatbox-error"
            leftSection={<IconTrash size={14} />}
            onClick={async () => {
              try {
                await deleteSessionStore(session.id)
                if (selected) {
                  router.navigate({ to: '/', replace: true })
                }
              } catch (error) {
                console.error('Failed to delete session:', error)
              }
            }}
          >
            {t('Delete')}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Flex>
  )
}

export default memo(SessionItem)
