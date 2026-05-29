import { Component, createMemo } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Tabs } from "@opencode-ai/ui/tabs"
import { Icon } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { SettingsGeneral } from "./settings-general"
import { SettingsKeybinds } from "./settings-keybinds"
import { SettingsProviders } from "./settings-providers"
import { SettingsModels } from "./settings-models"
import { useSettings } from "@/context/settings"

export const DialogSettings: Component = () => {
  const language = useLanguage()
  const platform = usePlatform()
  const settings = useSettings()

  // Check if we're on mobile
  const isMobile = createMemo(() => {
    // Use the settings or window width to determine mobile
    if (typeof window !== "undefined") {
      return window.innerWidth < 640
    }
    return false
  })

  return (
    <Dialog size={isMobile() ? "full" : "x-large"} transition class="max-w-none">
      <Tabs 
        orientation={isMobile() ? "horizontal" : "vertical"} 
        variant="settings" 
        defaultValue="general" 
        class="h-full settings-dialog flex-col sm:flex-row"
      >
        <Tabs.List class={isMobile() ? "flex-row overflow-x-auto pb-2 border-b border-border-weak" : ""}>
          <div class="flex flex-col justify-between h-full w-full">
            <div class="flex flex-col gap-3 w-full pt-3">
              <div class="flex flex-col gap-3">
                <div class="flex flex-col gap-1.5">
                  <Tabs.SectionTitle class={isMobile() ? "sr-only" : ""}>{language.t("settings.section.desktop")}</Tabs.SectionTitle>
                  <div class="flex flex-row sm:flex-col gap-1.5 w-full">
                    <Tabs.Trigger value="general" class="flex-shrink-0">
                      <Icon name="sliders" />
                      <span class={isMobile() ? "sr-only" : ""}>{language.t("settings.tab.general")}</span>
                    </Tabs.Trigger>
                    <Tabs.Trigger value="shortcuts" class="flex-shrink-0">
                      <Icon name="keyboard" />
                      <span class={isMobile() ? "sr-only" : ""}>{language.t("settings.tab.shortcuts")}</span>
                    </Tabs.Trigger>
                  </div>
                </div>

                <div class="flex flex-col gap-1.5">
                  <Tabs.SectionTitle class={isMobile() ? "sr-only" : ""}>{language.t("settings.section.server")}</Tabs.SectionTitle>
                  <div class="flex flex-row sm:flex-col gap-1.5 w-full">
                    <Tabs.Trigger value="providers" class="flex-shrink-0">
                      <Icon name="providers" />
                      <span class={isMobile() ? "sr-only" : ""}>{language.t("settings.providers.title")}</span>
                    </Tabs.Trigger>
                    <Tabs.Trigger value="models" class="flex-shrink-0">
                      <Icon name="models" />
                      <span class={isMobile() ? "sr-only" : ""}>{language.t("settings.models.title")}</span>
                    </Tabs.Trigger>
                  </div>
                </div>
              </div>
            </div>
            <div class="hidden sm:flex flex-col gap-1 pl-1 py-1 text-12-medium text-text-weak">
              <span>{language.t("app.name.desktop")}</span>
              <span class="text-11-regular">v{platform.version}</span>
            </div>
          </div>
        </Tabs.List>
        <Tabs.Content value="general" class="no-scrollbar flex-1">
          <SettingsGeneral />
        </Tabs.Content>
        <Tabs.Content value="shortcuts" class="no-scrollbar flex-1">
          <SettingsKeybinds />
        </Tabs.Content>
        <Tabs.Content value="providers" class="no-scrollbar flex-1">
          <SettingsProviders />
        </Tabs.Content>
        <Tabs.Content value="models" class="no-scrollbar flex-1">
          <SettingsModels />
        </Tabs.Content>
      </Tabs>
    </Dialog>
  )
}
