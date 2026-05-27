import "@/index.css"
import * as Sentry from "@sentry/solid"
import { I18nProvider } from "@opencode-ai/ui/context"
import { DialogProvider, useDialog } from "@opencode-ai/ui/context/dialog"
import { FileComponentProvider } from "@opencode-ai/ui/context/file"
import { MarkedProvider } from "@opencode-ai/ui/context/marked"
import { Button } from "@opencode-ai/ui/button"
import { File } from "@opencode-ai/ui/file"
import { Font } from "@opencode-ai/ui/font"
import { Splash } from "@opencode-ai/ui/logo"
import { TextField } from "@opencode-ai/ui/text-field"
import { ThemeProvider } from "@opencode-ai/ui/theme/context"
import { MetaProvider } from "@solidjs/meta"
import { type BaseRouterProps, Navigate, Route, Router } from "@solidjs/router"
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query"
import { Effect } from "effect"
import {
  type Component,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  ErrorBoundary,
  For,
  type JSX,
  lazy,
  onCleanup,
  onMount,
  type ParentProps,
  Show,
  Suspense,
} from "solid-js"
import { Dynamic } from "solid-js/web"
import { CommandProvider } from "@/context/command"
import { CommentsProvider } from "@/context/comments"
import { FileProvider } from "@/context/file"
import { ServerSDKProvider } from "@/context/server-sdk"
import { ServerSyncProvider } from "@/context/server-sync"
import { HighlightsProvider } from "@/context/highlights"
import { LanguageProvider, type Locale, useLanguage } from "@/context/language"
import { LayoutProvider } from "@/context/layout"
import { ModelsProvider } from "@/context/models"
import { NotificationProvider } from "@/context/notification"
import { PermissionProvider } from "@/context/permission"
import { PromptProvider } from "@/context/prompt"
import { ServerConnection, ServerProvider, serverName, useServer } from "@/context/server"
import { SettingsProvider } from "@/context/settings"
import { TerminalProvider } from "@/context/terminal"
import DirectoryLayout from "@/pages/directory-layout"
import Layout from "@/pages/layout"
import { ErrorPage } from "./pages/error"
import { DialogSelectServer } from "@/components/dialog-select-server"
import { useCheckServerHealth } from "./utils/server-health"
import { ServersProvider } from "./context/servers"

if (import.meta.env.VITE_OPENCODE_CHANNEL !== "prod") {
  document.body.classList.remove("text-12-regular")
  document.body.classList.add("font-(family-name:--font-family-text)", "text-[13px]", "font-[440]")
}

const HomeRoute = lazy(() => import("@/pages/home"))
const Session = lazy(() => import("@/pages/session"))

const SessionRoute = Object.assign(
  () => (
    <SessionProviders>
      <Session />
    </SessionProviders>
  ),
  { preload: Session.preload },
)

function UiI18nBridge(props: ParentProps) {
  const language = useLanguage()
  return <I18nProvider value={{ locale: language.intl, t: language.t }}>{props.children}</I18nProvider>
}

declare global {
  interface Window {
    __OPENCODE__?: {
      updaterEnabled?: boolean
      deepLinks?: string[]
      wsl?: boolean
    }
    api?: {
      setTitlebar?: (theme: { mode: "light" | "dark" }) => Promise<void>
      exportDebugLogs?: () => Promise<string>
    }
  }
}

function QueryProvider(props: ParentProps) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnReconnect: false,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
      },
    },
  })
  return <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
}

function AppShellProviders(props: ParentProps) {
  return (
    <SettingsProvider>
      <PermissionProvider>
        <LayoutProvider>
          <NotificationProvider>
            <ModelsProvider>
              <CommandProvider>
                <HighlightsProvider>
                  <Layout>{props.children}</Layout>
                </HighlightsProvider>
              </CommandProvider>
            </ModelsProvider>
          </NotificationProvider>
        </LayoutProvider>
      </PermissionProvider>
    </SettingsProvider>
  )
}

function SessionProviders(props: ParentProps) {
  return (
    <TerminalProvider>
      <FileProvider>
        <PromptProvider>
          <CommentsProvider>{props.children}</CommentsProvider>
        </PromptProvider>
      </FileProvider>
    </TerminalProvider>
  )
}

export function AppBaseProviders(props: ParentProps<{ locale?: Locale }>) {
  return (
    <MetaProvider>
      <Font />
      <ThemeProvider
        onThemeApplied={(_, mode) => {
          void window.api?.setTitlebar?.({ mode })
        }}
      >
        <LanguageProvider locale={props.locale}>
          <UiI18nBridge>
            <ErrorBoundary
              fallback={(error) => {
                Sentry.captureException(error)
                return <ErrorPage error={error} />
              }}
            >
              <QueryProvider>
                <DialogProvider>
                  <MarkedProvider>
                    <FileComponentProvider component={File}>{props.children}</FileComponentProvider>
                  </MarkedProvider>
                </DialogProvider>
              </QueryProvider>
            </ErrorBoundary>
          </UiI18nBridge>
        </LanguageProvider>
      </ThemeProvider>
    </MetaProvider>
  )
}

function ConnectionGate(props: ParentProps<{ disableHealthCheck?: boolean }>) {
  const server = useServer()
  const checkServerHealth = useCheckServerHealth()

  const [checkMode, setCheckMode] = createSignal<"blocking" | "background">("blocking")

  const missingPassword = () => {
    const current = server.current
    if (!current || current.type !== "http") return false
    return (
      import.meta.env.VITE_NO_PERSIST_PASSWORDS && current.requiresPassword && !current.http.password
    )
  }

  const [startupHealthCheck, healthCheckActions] = createResource(() => {
    const current = server.current
    return Effect.gen(function* () {
      if (
        import.meta.env.VITE_NO_PERSIST_PASSWORDS &&
        current?.type === "http" &&
        current.requiresPassword &&
        !current.http.password
      )
        return false
      if (props.disableHealthCheck) return true
      if (!current) return true
      const { http, type } = current
      while (true) {
        const res = yield* Effect.promise(() => checkServerHealth(http))
        if (res.healthy) return true
        if (checkMode() === "background" || type === "http") return false
      }
    }).pipe(
      Effect.timeoutOrElse({ duration: "10 seconds", orElse: () => Effect.succeed(false) }),
      Effect.ensuring(Effect.sync(() => setCheckMode("background"))),
      Effect.runPromise,
    )
  })

  return (
    <Suspense
      fallback={
        <div class="h-dvh w-screen flex flex-col items-center justify-center bg-background-base">
          <Splash class="w-16 h-20 opacity-50 animate-pulse" />
        </div>
      }
    >
      {/*<Show
        when={checkMode() === "blocking" ? !startupHealthCheck.loading : startupHealthCheck.state !== "pending"}
        fallback={
          <div class="h-dvh w-screen flex flex-col items-center justify-center bg-background-base">
            <Splash class="w-16 h-20 opacity-50 animate-pulse" />
          </div>
        }
      >*/}
      {checkMode() === "blocking" ? startupHealthCheck() : startupHealthCheck.latest}
      <Show
        when={startupHealthCheck()}
        fallback={
          <ConnectionError
            onRetry={() => {
              if (checkMode() === "background") void healthCheckActions.refetch()
            }}
            onServerSelected={(key) => {
              setCheckMode("blocking")
              server.setActive(key)
              void healthCheckActions.refetch()
            }}
          />
        }
      >
        {props.children}
      </Show>
      {/*</Show>*/}
    </Suspense>
  )
}

function ReconnectForm(props: {
  server: ServerConnection.Http
  onConnect: (password: string) => void
  onManageServers: () => void
}) {
  const language = useLanguage()
  const checkServerHealth = useCheckServerHealth()
  const [password, setPassword] = createSignal("")
  const [error, setError] = createSignal("")
  const [busy, setBusy] = createSignal(false)

  const handleSubmit = async () => {
    setError("")
    setBusy(true)
    const pw = password()
    try {
      const result = await checkServerHealth({ ...props.server.http, password: pw })
      if (!result.healthy) {
        setError(language.t("dialog.server.add.error"))
        return
      }
      props.onConnect(pw)
    } finally {
      setBusy(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Enter" || e.isComposing) return
    e.preventDefault()
    handleSubmit()
  }

  return (
    <div class="flex flex-col gap-4 w-full max-w-sm">
      <p class="text-14-regular text-text-base text-center">{serverName(props.server)}</p>
      <TextField
        type="password"
        label={language.t("dialog.server.add.password")}
        placeholder={language.t("dialog.server.add.passwordPlaceholder")}
        value={password()}
        autofocus
        validationState={error() ? "invalid" : "valid"}
        error={error()}
        disabled={busy()}
        onChange={setPassword}
        onKeyDown={handleKeyDown}
      />
      <div class="flex flex-col gap-2">
        <Button variant="primary" size="large" onClick={handleSubmit} disabled={busy()} class="px-3 py-1.5 w-full">
          {language.t("app.server.reconnect")}
        </Button>
        <Button variant="ghost" size="large" onClick={props.onManageServers} class="px-3 py-1.5 w-full">
          {language.t("status.popover.action.manageServers")}
        </Button>
      </div>
    </div>
  )
}

function ConnectionError(props: { onRetry?: () => void; onServerSelected?: (key: ServerConnection.Key) => void }) {
  const language = useLanguage()
  const server = useServer()
  const dialog = useDialog()
  const others = () => server.list.filter((s) => ServerConnection.key(s) !== server.key)
  const name = createMemo(() => server.name || server.key)
  const serverToken = "\u0000server\u0000"
  const unreachable = createMemo(() => language.t("app.server.unreachable", { server: serverToken }).split(serverToken))

  const needsReconnect = () => {
    const current = server.current
    if (!current || current.type !== "http") return false
    return current.requiresPassword && !current.http.password
  }

  createEffect(() => {
    if (needsReconnect()) return
    const timer = setInterval(() => props.onRetry?.(), 1000)
    onCleanup(() => clearInterval(timer))
  })

  return (
    <div class="h-dvh w-screen flex flex-col items-center justify-center bg-background-base gap-6 p-6">
      <Show
        when={needsReconnect()}
        fallback={
          <>
            <div class="flex flex-col items-center max-w-md text-center">
              <Splash class="w-12 h-15 mb-4" />
              <p class="text-14-regular text-text-base">
                {unreachable()[0]}
                <span class="text-text-strong font-medium">{name()}</span>
                {unreachable()[1]}
              </p>
              <p class="mt-1 text-12-regular text-text-weak">{language.t("app.server.retrying")}</p>
            </div>
            <Show when={others().length > 0}>
              <div class="flex flex-col gap-2 w-full max-w-sm">
                <span class="text-12-regular text-text-base text-center">{language.t("app.server.otherServers")}</span>
                <div class="flex flex-col gap-1 bg-surface-base rounded-lg p-2">
                  <For each={others()}>
                    {(conn) => {
                      const key = ServerConnection.key(conn)
                      return (
                        <button
                          type="button"
                          class="flex items-center gap-3 w-full px-3 py-2 rounded-md hover:bg-surface-raised-base-hover transition-colors text-left"
                          onClick={() => props.onServerSelected?.(key)}
                        >
                          <span class="text-14-regular text-text-strong truncate">{serverName(conn)}</span>
                        </button>
                      )
                    }}
                  </For>
                </div>
              </div>
            </Show>
          </>
        }
      >
        <Splash class="w-12 h-15 mb-4" />
        <ReconnectForm
          server={server.current as ServerConnection.Http}
          onConnect={(password) => {
            const current = server.current
            if (!current || current.type !== "http") return
            server.add({ ...current, http: { ...current.http, password } })
            props.onRetry?.()
          }}
          onManageServers={() => dialog.show(() => <DialogSelectServer />)}
        />
      </Show>
    </div>
  )
}

function RemoteOnlyFallback() {
  const dialog = useDialog()
  const language = useLanguage()

  onMount(() => {
    const id = setTimeout(() => {
      dialog.show(() => <DialogSelectServer />)
    }, 100)
    return () => clearTimeout(id)
  })

  return (
    <div class="h-dvh w-screen flex flex-col items-center justify-center bg-background-base gap-6 p-6">
      <div class="flex flex-col items-center max-w-md text-center gap-4">
        <Splash class="w-12 h-15 mb-4" />
        <p class="text-14-regular text-text-base">{language.t("dialog.server.title")}</p>
        <p class="text-12-regular text-text-weak">{language.t("dialog.server.description")}</p>
        <button
          type="button"
          class="mt-2 px-4 py-2 rounded-md bg-surface-base text-text-strong text-14-regular hover:bg-surface-raised-base-hover transition-colors"
          onClick={() => dialog.show(() => <DialogSelectServer />)}
        >
          {language.t("dialog.server.add.button")}
        </button>
      </div>
    </div>
  )
}

function AppRouterRoot(props: ParentProps<{ appChildren?: JSX.Element }>) {
  const server = useServer()
  return (
    <Show when={server.key} keyed fallback={<RemoteOnlyFallback />}>
      <ServerSDKProvider>
        <ServerSyncProvider>
          <AppShellProviders>
            {props.appChildren}
            {props.children}
          </AppShellProviders>
        </ServerSyncProvider>
      </ServerSDKProvider>
    </Show>
  )
}

export function AppInterface(props: {
  children?: JSX.Element
  defaultServer?: ServerConnection.Key
  servers?: Array<ServerConnection.Any>
  router?: Component<BaseRouterProps>
  disableHealthCheck?: boolean
}) {
  return (
    <ServerProvider defaultServer={props.defaultServer} servers={props.servers}>
      <ServersProvider>
        <ConnectionGate disableHealthCheck={props.disableHealthCheck}>
          <QueryProvider>
            <Dynamic
              component={props.router ?? Router}
              root={(routerProps) => <AppRouterRoot appChildren={props.children}>{routerProps.children}</AppRouterRoot>}
            >
              <Route path="/" component={HomeRoute} />
              <Route path="/:dir" component={DirectoryLayout}>
                <Route path="/" component={() => <Navigate href="session" />} />
                <Route path="/session/:id?" component={SessionRoute} />
              </Route>
            </Dynamic>
          </QueryProvider>
        </ConnectionGate>
      </ServersProvider>
    </ServerProvider>
  )
}
