import { ActionIcon, Grid, Input, Paper, ScrollArea, Text } from '@mantine/core'
import type { TablerIcon } from '@tabler/icons-react'
import { IconSearch } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as TablerIcons from '@tabler/icons-react'
import { ScalableIcon } from './ScalableIcon'

// Popular folder-related icons shown by default
const POPULAR_ICONS = [
  'IconFolder',
  'IconFolderStar',
  'IconFolderHeart',
  'IconFolderCheck',
  'IconFolderX',
  'IconFolderMinus',
  'IconFolderPlus',
  'IconFolderShare',
  'IconFolderCog',
  'IconBriefcase',
  'IconBriefcase2',
  'IconHome',
  'IconBuilding',
  'IconBuildingStore',
  'IconSchool',
  'IconBook',
  'IconBooks',
  'IconCode',
  'IconTerminal',
  'IconDeviceLaptop',
  'IconCalendar',
  'IconNotes',
  'IconMail',
  'IconMessage',
  'IconUser',
  'IconUsers',
  'IconStar',
  'IconHeart',
  'IconArchive',
  'IconTrash',
  'IconSettings',
  'IconTool',
  'IconPaint',
  'IconPalette',
  'IconPhoto',
  'IconMusic',
  'IconMovie',
  'IconGame',
  'IconShoppingCart',
  'IconCreditCard',
  'IconWallet',
  'IconCoin',
  'IconTrendingUp',
  'IconChartBar',
  'IconChartPie',
  'IconReport',
  'IconFileText',
  'IconFileCode',
  'IconFileSpreadsheet',
  'IconFileTypePdf',
  'IconFileTypeDoc',
]

interface IconPickerProps {
  value?: string
  onChange: (iconName: string) => void
}

// Simple fuzzy match function
function fuzzyMatch(query: string, target: string): boolean {
  const normalizedQuery = query.toLowerCase().replace(/[^a-z0-9]/g, '')
  const normalizedTarget = target.toLowerCase().replace(/[^a-z0-9]/g, '')

  if (normalizedTarget.includes(normalizedQuery)) return true

  // Check if all characters in query appear in target in order
  let queryIndex = 0
  for (let i = 0; i < normalizedTarget.length && queryIndex < normalizedQuery.length; i++) {
    if (normalizedTarget[i] === normalizedQuery[queryIndex]) {
      queryIndex++
    }
  }
  return queryIndex === normalizedQuery.length
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')

  const availableIcons = useMemo(() => {
    // Get all Icon* exports from @tabler/icons-react
    const allIcons = Object.keys(TablerIcons).filter(
      (key) => key.startsWith('Icon') && key !== 'IconProps' && key !== 'IconContext'
    )

    if (!search.trim()) {
      return POPULAR_ICONS
    }

    // Filter icons based on fuzzy search
    return allIcons
      .filter((iconName) => fuzzyMatch(search, iconName))
      .sort((a, b) => {
        // Prioritize exact matches and starts-with matches
        const aLower = a.toLowerCase()
        const bLower = b.toLowerCase()
        const searchLower = search.toLowerCase()

        const aExact = aLower === searchLower ? 2 : aLower.startsWith(searchLower) ? 1 : 0
        const bExact = bLower === searchLower ? 2 : bLower.startsWith(searchLower) ? 1 : 0

        return bExact - aExact || a.localeCompare(b)
      })
      .slice(0, 50) // Limit to 50 results for performance
  }, [search])

  return (
    <div className="w-full">
      <Input
        placeholder={t('Search icons...')}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        leftSection={<IconSearch size={16} />}
        className="mb-3"
      />

      <Paper withBorder className="p-2 mt-3">
        <ScrollArea h={180}>
          <Grid gutter="xs">
            {availableIcons.map((iconName) => {
              const IconComponent = (TablerIcons as Record<string, TablerIcon>)[iconName]
              if (!IconComponent) return null

              const isSelected = value === iconName

              return (
                <Grid.Col span={3} key={iconName}>
                  <ActionIcon
                    variant={isSelected ? 'filled' : 'subtle'}
                    color={isSelected ? 'chatbox-brand' : 'gray'}
                    className="w-full h-10"
                    onClick={() => onChange(iconName)}
                    title={iconName.replace('Icon', '')}
                  >
                    <ScalableIcon icon={IconComponent} size={20} />
                  </ActionIcon>
                </Grid.Col>
              )
            })}
          </Grid>

          {availableIcons.length === 0 && (
            <Text c="dimmed" ta="center" py="xl">
              {t('No icons found')}
            </Text>
          )}
        </ScrollArea>
      </Paper>
    </div>
  )
}
