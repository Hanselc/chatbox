import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Button, Loader, Stack, Switch, Text, Textarea } from '@mantine/core'
import { getDefaultPrompt } from '@shared/defaults'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { rebuildAllSessionsSystemInstruction } from '@/stores/folderStore'
import { settingsStore, useSettingsStore } from '@/stores/settingsStore'
import { add as addToast } from '@/stores/toastActions'

const GlobalSystemInstructionModal = NiceModal.create(() => {
  const modal = useModal()
  const { t } = useTranslation()

  const currentPrompt = useSettingsStore((state) => state.defaultPrompt || '')
  const setSettings = useSettingsStore((state) => state.setSettings)

  const [prompt, setPrompt] = useState(currentPrompt)
  const [applyToAll, setApplyToAll] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (modal.visible) {
      setPrompt(settingsStore.getState().defaultPrompt || '')
      setApplyToAll(false)
      setLoading(false)
    }
  }, [modal.visible])

  const handleSave = async () => {
    setLoading(true)

    // Save the new global prompt
    setSettings({ defaultPrompt: prompt })

    if (applyToAll) {
      try {
        const { updated, failed } = await rebuildAllSessionsSystemInstruction()
        if (failed > 0) {
          addToast(
            t('Updated {{updated}} chats, {{failed}} failed', { updated, failed }) as string
          )
        } else {
          addToast(t('Updated {{updated}} chats', { updated }) as string)
        }
      } catch (e) {
        console.error('Failed to rebuild system instructions:', e)
        addToast(t('Failed to update system instructions') as string)
      }
    }

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
      size="md"
      title={t('Global System Instruction')}
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
      withCloseButton={!loading}
    >
      {loading ? (
        <Stack align="center" gap="md" py="xl">
          <Loader size="lg" />
          <Text c="chatbox-tertiary">
            {t('Updating chats...')}
          </Text>
        </Stack>
      ) : (
        <>
          <Stack>
            <Textarea
              label={t('Default System Instruction')}
              description={t('This instruction will be applied to all new chats')}
              placeholder={getDefaultPrompt()}
              autosize
              minRows={2}
              maxRows={12}
              value={prompt}
              onChange={(e) => setPrompt(e.currentTarget.value)}
              classNames={{ input: '!text-chatbox-tint-primary' }}
            />

            <Button
              variant="subtle"
              color="chatbox-gray"
              onClick={() => setPrompt(getDefaultPrompt())}
              px={3}
              py={6}
              className="self-start"
            >
              {t('Reset to Default')}
            </Button>

            <Switch
              label={t('Apply to all existing chats')}
              description={t('When enabled, all existing chats will be updated with the new instruction')}
              checked={applyToAll}
              onChange={(event) => setApplyToAll(event.target.checked)}
            />
          </Stack>

          <AdaptiveModal.Actions>
            <AdaptiveModal.CloseButton onClick={handleCancel} />
            <Button onClick={handleSave}>
              {t('Save')}
            </Button>
          </AdaptiveModal.Actions>
        </>
      )}
    </AdaptiveModal>
  )
})

export default GlobalSystemInstructionModal
