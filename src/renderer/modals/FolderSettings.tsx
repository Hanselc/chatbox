import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { ActionIcon, Button, Flex, Input, Stack, Switch, Text, Textarea, Transition } from '@mantine/core'
import type { ChatFolder } from '@shared/types'
import type { TablerIcon } from '@tabler/icons-react'
import { IconArrowLeft, IconChevronRight, IconFolder } from '@tabler/icons-react'
import * as TablerIcons from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { HexColorPicker } from 'react-colorful'
import { useTranslation } from 'react-i18next'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { IconPicker } from '@/components/common/IconPicker'
import { ScalableIcon } from '@/components/common/ScalableIcon'
import { createFolder, updateFolder, updateFolderInstructionsOnAllSessions } from '@/stores/folderStore'

const PRESET_COLORS = [
  '#228be6',
  '#fa5252',
  '#12b886',
  '#fab005',
  '#7950f2',
  '#be4bdb',
  '#e64980',
  '#fd7e14',
  '#40c057',
  '#15aabf',
  '#868e96',
  '#343a40',
]

type FolderSettingsModalProps = {
  folder?: ChatFolder
}

const TRANSITION_DURATION = 300

const FolderSettingsModal = NiceModal.create(({ folder }: FolderSettingsModalProps = {}) => {
  const modal = useModal()
  const { t } = useTranslation()
  const [screen, setScreen] = useState<'main' | 'customize'>('main')

  const [name, setName] = useState(folder?.name ?? '')
  const [systemInstruction, setSystemInstruction] = useState(folder?.systemInstruction ?? '')
  const [ignoreOtherInstructions, setIgnoreOtherInstructions] = useState(folder?.ignoreOtherInstructions ?? false)
  const [icon, setIcon] = useState(folder?.icon ?? 'IconFolder')
  const [color, setColor] = useState(folder?.color ?? '')

  useEffect(() => {
    if (!modal.visible) return
    if (!folder) {
      setName('')
      setSystemInstruction('')
      setIgnoreOtherInstructions(false)
      setIcon('IconFolder')
      setColor('')
    } else {
      setName(folder.name)
      setSystemInstruction(folder.systemInstruction)
      setIgnoreOtherInstructions(folder.ignoreOtherInstructions)
      setIcon(folder.icon ?? 'IconFolder')
      setColor(folder.color ?? '')
    }
    // Reset to main screen when modal opens
    setScreen('main')
  }, [modal.visible, folder])

  const isCreate = !folder

  // Get preview icon component
  const PreviewIcon = useMemo(() => {
    if (icon && icon in TablerIcons) {
      return TablerIcons[icon as keyof typeof TablerIcons] as TablerIcon
    }
    return IconFolder
  }, [icon])

  const handleSave = useCallback(async () => {
    if (!name.trim()) return

    if (isCreate) {
      await createFolder(name, systemInstruction, ignoreOtherInstructions, icon, color || undefined)
    } else if (folder) {
      const oldInstruction = folder.systemInstruction
      const oldIgnoreGlobal = folder.ignoreOtherInstructions
      await updateFolder(folder.id, {
        name: name.trim(),
        systemInstruction,
        ignoreOtherInstructions,
        icon,
        color: color || undefined,
      })
      if (oldInstruction !== systemInstruction || oldIgnoreGlobal !== ignoreOtherInstructions) {
        await updateFolderInstructionsOnAllSessions(folder.id, systemInstruction)
      }
    }

    setScreen('main')
    modal.resolve()
    modal.hide()
  }, [name, systemInstruction, ignoreOtherInstructions, icon, color, folder, isCreate, modal])

  const handleCancel = useCallback(() => {
    setScreen('main')
    modal.resolve()
    modal.hide()
  }, [modal])

  const handleBack = useCallback(() => {
    setScreen('main')
  }, [])

  return (
    <AdaptiveModal
      opened={modal.visible}
      onClose={handleCancel}
      centered
      size="md"
      title={
        screen === 'customize' ? (
          <Flex align="center" gap="xs">
            <ActionIcon variant="subtle" size="sm" onClick={handleBack}>
              <ScalableIcon icon={IconArrowLeft} size={18} />
            </ActionIcon>
            {t('Customize Folder')}
          </Flex>
        ) : isCreate ? (
          t('New Folder')
        ) : (
          t('Folder Settings')
        )
      }
    >
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        {/* Main Screen */}
        <Transition
          mounted={screen === 'main'}
          transition="slide-right"
          duration={TRANSITION_DURATION}
          timingFunction="ease"
        >
          {(styles) => (
            <div
              style={{
                ...styles,
                position: screen === 'main' ? 'relative' : 'absolute',
                top: 0,
                left: 0,
                right: 0,
                opacity: screen === 'main' ? 1 : 0,
                pointerEvents: screen === 'main' ? 'auto' : 'none',
              }}
            >
              <Stack>
                <Input.Wrapper label={t('Name')}>
                  <Input
                    placeholder={t('Folder name') || ''}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                    classNames={{ input: '!text-chatbox-tint-primary' }}
                  />
                </Input.Wrapper>

                <Textarea
                  label={t('Shared System Instruction')}
                  placeholder={t('Instruction (System Prompt)') || ''}
                  description={t('This instruction will be applied to all chats in this folder')}
                  autosize
                  minRows={2}
                  maxRows={8}
                  value={systemInstruction}
                  onChange={(event) => setSystemInstruction(event.target.value)}
                  classNames={{ input: '!text-chatbox-tint-primary' }}
                  styles={{ input: { touchAction: 'manipulation' } }}
                />

                <Switch
                  label={t('Ignore global system instruction')}
                  description={t('When enabled, the global default prompt will not be applied to chats in this folder')}
                  checked={ignoreOtherInstructions}
                  onChange={(event) => setIgnoreOtherInstructions(event.target.checked)}
                />

                {/* Customize Folder Row with Preview */}
                <div
                  onClick={() => setScreen('customize')}
                  className="cursor-pointer p-3 rounded hover:bg-chatbox-background-gray-secondary transition-colors border border-chatbox-border-primary"
                >
                  <Flex align="center" justify="space-between">
                    <Flex align="center" gap="sm">
                      <ScalableIcon
                        icon={PreviewIcon}
                        size={20}
                        style={{ color: color || 'var(--chatbox-tint-brand)' }}
                      />
                      <Text>{t('Customize Folder')}</Text>
                    </Flex>
                    <ScalableIcon icon={IconChevronRight} size={16} className="text-chatbox-tertiary" />
                  </Flex>
                </div>
              </Stack>

              <div className="mt-6">
                <AdaptiveModal.Actions>
                  <Button onClick={handleSave} disabled={!name.trim()}>
                    {isCreate ? t('Create') : t('Save')}
                  </Button>
                </AdaptiveModal.Actions>
              </div>
            </div>
          )}
        </Transition>

        {/* Customize Screen */}
        <Transition
          mounted={screen === 'customize'}
          transition="slide-left"
          duration={TRANSITION_DURATION}
          timingFunction="ease"
        >
          {(styles) => (
            <div
              style={{
                ...styles,
                position: screen === 'customize' ? 'relative' : 'absolute',
                top: 0,
                left: 0,
                right: 0,
                opacity: screen === 'customize' ? 1 : 0,
                pointerEvents: screen === 'customize' ? 'auto' : 'none',
              }}
            >
              <Stack>
                {/* Color Picker */}
                <Input.Wrapper label={t('Color')}>
                  <div className="flex flex-col gap-2">
                    {/* Color Picker */}
                    <div className="react-colorful-wrapper">
                      <HexColorPicker
                        color={color || '#228be6'}
                        onChange={setColor}
                        style={{ width: '100%', height: '120px' }}
                      />
                    </div>

                    {/* Color Preview, Hex Input and Preset Colors in one row */}
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded border border-chatbox-border-primary flex-shrink-0"
                        style={{ backgroundColor: color || 'transparent' }}
                      />
                      <input
                        type="text"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        placeholder="#228be6"
                        className="w-20 px-2 py-1 rounded bg-chatbox-background-gray-secondary border border-chatbox-border-primary text-chatbox-tint-primary text-xs focus:outline-none focus:border-chatbox-accent"
                      />
                      <div className="flex-1 flex gap-1">
                        {PRESET_COLORS.map((presetColor) => (
                          <button
                            key={presetColor}
                            className="w-4 h-4 rounded-sm border transition-all hover:scale-110 flex-shrink-0"
                            style={{
                              backgroundColor: presetColor,
                              borderColor: color === presetColor ? '#fff' : 'transparent',
                              boxShadow: color === presetColor ? `0 0 0 1px ${presetColor}` : 'none',
                            }}
                            onClick={() => setColor(presetColor)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </Input.Wrapper>

                {/* Icon Picker - Second as requested */}
                <Input.Wrapper label={t('Icon')}>
                  <IconPicker value={icon} onChange={setIcon} />
                </Input.Wrapper>
              </Stack>

              <div className="mt-6">
                <AdaptiveModal.Actions>
                  <Button onClick={handleSave} disabled={!name.trim()}>
                    {isCreate ? t('Create') : t('Save')}
                  </Button>
                </AdaptiveModal.Actions>
              </div>
            </div>
          )}
        </Transition>
      </div>
    </AdaptiveModal>
  )
})

export default FolderSettingsModal
