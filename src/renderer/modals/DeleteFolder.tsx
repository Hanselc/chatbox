import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Button, Stack, Switch, Text } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ChatFolder } from '@shared/types'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { deleteFolder } from '@/stores/folderStore'

const DeleteFolderModal = NiceModal.create(({ folder }: { folder: ChatFolder }) => {
  const modal = useModal()
  const { t } = useTranslation()
  const [deleteChats, setDeleteChats] = useState(false)

  const handleDelete = async () => {
    await deleteFolder(folder.id, deleteChats)
    modal.resolve()
    modal.hide()
  }

  const handleCancel = () => {
    modal.resolve()
    modal.hide()
  }

  return (
    <AdaptiveModal
      opened={modal.visible}
      onClose={handleCancel}
      centered
      size="sm"
      title={t('Delete Folder')}
    >
      <Stack>
        <Text>
          {t('Are you sure you want to delete the folder')} <strong>{folder.name}</strong>?
        </Text>

        <Switch
          label={t('Also delete all chats in this folder')}
          checked={deleteChats}
          onChange={(event) => setDeleteChats(event.target.checked)}
        />
      </Stack>

      <AdaptiveModal.Actions>
        <AdaptiveModal.CloseButton onClick={handleCancel} />
        <Button onClick={handleDelete} color="chatbox-error">
          {t('Delete')}
        </Button>
      </AdaptiveModal.Actions>
    </AdaptiveModal>
  )
})

export default DeleteFolderModal
