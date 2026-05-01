import { ModelProviderEnum, ModelProviderType } from '../../types'
import { defineProvider } from '../registry'
import OpenCodeGo from './models/opencode-go'

export const openCodeGoProvider = defineProvider({
  id: ModelProviderEnum.OpenCodeGo,
  name: 'OpenCode Go',
  type: ModelProviderType.OpenAI,
  modelsDevProviderId: 'opencode',
  description: 'Low cost subscription for open coding models',
  urls: {
    website: 'https://opencode.ai/docs/go/',
    apiKey: 'https://opencode.ai/auth',
    docs: 'https://opencode.ai/docs/go/',
  },
  defaultSettings: {
    apiHost: 'https://opencode.ai/zen/go',
    models: [
      {
        modelId: 'glm-5.1',
        contextWindow: 128_000,
        capabilities: ['tool_use'],
      },
      {
        modelId: 'glm-5',
        contextWindow: 128_000,
        capabilities: ['tool_use'],
      },
      {
        modelId: 'kimi-k2.5',
        contextWindow: 256_000,
        capabilities: ['tool_use'],
      },
      {
        modelId: 'kimi-k2.6',
        contextWindow: 256_000,
        capabilities: ['tool_use'],
      },
      {
        modelId: 'deepseek-v4-pro',
        contextWindow: 128_000,
        capabilities: ['tool_use'],
      },
      {
        modelId: 'deepseek-v4-flash',
        contextWindow: 128_000,
        capabilities: ['tool_use'],
      },
      {
        modelId: 'mimo-v2-pro',
        contextWindow: 256_000,
        capabilities: ['tool_use'],
      },
      {
        modelId: 'mimo-v2-omni',
        contextWindow: 256_000,
        capabilities: ['vision', 'tool_use'],
      },
      {
        modelId: 'mimo-v2.5-pro',
        contextWindow: 256_000,
        capabilities: ['tool_use'],
      },
      {
        modelId: 'mimo-v2.5',
        contextWindow: 256_000,
        capabilities: ['tool_use'],
      },
      {
        modelId: 'minimax-m2.7',
        contextWindow: 1_000_000,
        capabilities: ['tool_use'],
      },
      {
        modelId: 'minimax-m2.5',
        contextWindow: 1_000_000,
        capabilities: ['tool_use'],
      },
      {
        modelId: 'qwen3.6-plus',
        contextWindow: 131_072,
        capabilities: ['tool_use'],
      },
      {
        modelId: 'qwen3.5-plus',
        contextWindow: 131_072,
        capabilities: ['tool_use'],
      },
    ],
  },
  createModel: (config) => {
    return new OpenCodeGo(
      {
        apiKey: config.providerSetting.apiKey || '',
        model: config.model,
        temperature: config.settings.temperature,
        topP: config.settings.topP,
        maxOutputTokens: config.settings.maxTokens,
        stream: config.settings.stream,
        useProxy: true,
      },
      config.dependencies
    )
  },
  getDisplayName: (modelId, providerSettings) => {
    return `OpenCode Go (${providerSettings?.models?.find((m) => m.modelId === modelId)?.nickname || modelId})`
  },
})
