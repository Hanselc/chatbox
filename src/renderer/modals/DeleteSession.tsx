import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Button, Text } from '@mantine/core'
import type { SessionMeta } from '@shared/types'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { deleteSession } from '@/stores/chatStore'

interface DeleteSessionModalProps {
  session: SessionMeta
  onDeleted?: () => void
}

const DeleteSessionModal = NiceModal.create(({ session, onDeleted }: DeleteSessionModalProps) => {
  const modal = useModal()
  const { t } = useTranslation()

  const handleDelete = useCallback(async () => {
    try {
      await deleteSession(session.id)
      onDeleted?.()
      modal.resolve()
      modal.hide()
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
  }, [session.id, onDeleted, modal])

  const handleCancel = useCallback(() => {
    modal.resolve()
    modal.hide()
  }, [modal])

  return (
    <AdaptiveModal
      opened={modal.visible}
      onClose={handleCancel}
      centered
      size="sm"
      title={t('Delete Chat')}
    >
      <Text>
        {t('Are you sure you want to delete')} <strong>{session.name}</strong>?
      </Text>
      <Text size="sm" c="dimmed" mt="xs">
        {t('This action cannot be undone.')}
      </Text>

      <AdaptiveModal.Actions>
        <AdaptiveModal.CloseButton onClick={handleCancel} />
        <Button onClick={handleDelete} color="chatbox-error">
          {t('Delete')}
        </Button>
      </AdaptiveModal.Actions>
    </AdaptiveModal>
  )
})

export default DeleteSessionModal
