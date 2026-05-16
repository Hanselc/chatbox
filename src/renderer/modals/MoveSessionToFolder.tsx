import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Flex, Stack, Text, UnstyledButton } from '@mantine/core'
import { IconFolder } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import type { SessionMeta } from '@shared/types'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { useFolders, moveSessionToFolder } from '@/stores/folderStore'
import { getEffectiveFolderId } from '@/utils/folder-utils'

const MoveSessionToFolderModal = NiceModal.create(({ session }: { session: SessionMeta }) => {
  const modal = useModal()
  const { t } = useTranslation()
  const { folders } = useFolders()

  const effectiveFolderId = getEffectiveFolderId(session, folders ?? [])

  const handleMove = async (folderId: string | null) => {
    await moveSessionToFolder(session.id, folderId)
    modal.resolve()
    modal.hide()
  }

  const handleCancel = () => {
    modal.resolve()
    modal.hide()
  }

  const filteredFolders = folders?.filter((f) => f.id !== effectiveFolderId) ?? []

  return (
    <AdaptiveModal
      opened={modal.visible}
      onClose={handleCancel}
      centered
      size="sm"
      title={t('Move to Folder')}
    >
      <Stack gap="xs">
        {effectiveFolderId && (
          <UnstyledButton
            onClick={() => void handleMove(null)}
            className="p-2 rounded hover:bg-chatbox-background-gray-secondary transition-colors"
          >
            <Flex align="center" gap="sm">
              <IconFolder size={18} />
              <Text>{t('No Folder')}</Text>
            </Flex>
          </UnstyledButton>
        )}
        {filteredFolders.map((folder) => (
          <UnstyledButton
            key={folder.id}
            onClick={() => void handleMove(folder.id)}
            className="p-2 rounded hover:bg-chatbox-background-gray-secondary transition-colors"
          >
            <Flex align="center" gap="sm">
              <IconFolder size={18} />
              <Text>{folder.name}</Text>
            </Flex>
          </UnstyledButton>
        ))}
        {filteredFolders.length === 0 && !effectiveFolderId && (
          <Text c="chatbox-tertiary" p="sm">
            {t('No folders')}
          </Text>
        )}
      </Stack>

      <AdaptiveModal.Actions>
        <AdaptiveModal.CloseButton onClick={handleCancel} />
      </AdaptiveModal.Actions>
    </AdaptiveModal>
  )
})

export default MoveSessionToFolderModal
