import { ModelProviderEnum, ModelProviderType } from '../../types'
import { defineProvider } from '../registry'
import OpenCodeZen from './models/opencode-zen'

export const openCodeZenProvider = defineProvider({
  id: ModelProviderEnum.OpenCodeZen,
  name: 'OpenCode Zen',
  type: ModelProviderType.OpenAI,
  modelsDevProviderId: 'opencode',
  description: 'Curated list of premium AI models from OpenCode',
  urls: {
    website: 'https://opencode.ai/docs/zen/',
    apiKey: 'https://opencode.ai/auth',
    docs: 'https://opencode.ai/docs/zen/',
  },
  defaultSettings: {
    apiHost: 'https://opencode.ai/zen',
    models: [
      {
        modelId: 'gpt-5.5',
        contextWindow: 128_000,
        capabilities: ['vision', 'tool_use'],
      },
      {
        modelId: 'claude-opus-4-6',
        contextWindow: 200_000,
        capabilities: ['vision', 'tool_use'],
      },
      {
        modelId: 'gemini-3.1-pro',
        contextWindow: 1_000_000,
        capabilities: ['vision', 'tool_use'],
      },
      {
        modelId: 'kimi-k2.6',
        contextWindow: 256_000,
        capabilities: ['tool_use'],
      },
      {
        modelId: 'qwen3.6-plus',
        contextWindow: 131_072,
        capabilities: ['tool_use'],
      },
      {
        modelId: 'glm-5.1',
        contextWindow: 128_000,
        capabilities: ['tool_use'],
      },
      {
        modelId: 'minimax-m2.7',
        contextWindow: 1_000_000,
        capabilities: ['tool_use'],
      },
      {
        modelId: 'claude-sonnet-4-6',
        contextWindow: 200_000,
        capabilities: ['vision', 'tool_use'],
      },
      {
        modelId: 'gpt-5.4-mini',
        contextWindow: 128_000,
        capabilities: ['vision', 'tool_use'],
      },
      {
        modelId: 'gpt-5.4',
        contextWindow: 128_000,
        capabilities: ['vision', 'tool_use'],
      },
      // Free models
      {
        modelId: 'big-pickle',
        contextWindow: 128_000,
        capabilities: ['tool_use'],
      },
      {
        modelId: 'minimax-m2.5-free',
        contextWindow: 1_000_000,
        capabilities: ['tool_use'],
      },
      {
        modelId: 'ling-2.6-flash',
        contextWindow: 128_000,
        capabilities: ['tool_use'],
      },
      {
        modelId: 'hy3-preview-free',
        contextWindow: 128_000,
        capabilities: ['tool_use'],
      },
      {
        modelId: 'nemotron-3-super-free',
        contextWindow: 128_000,
        capabilities: ['tool_use'],
      },
      {
        modelId: 'gpt-5-nano',
        contextWindow: 128_000,
        capabilities: ['vision', 'tool_use'],
      },
    ],
  },
  createModel: (config) => {
    return new OpenCodeZen(
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
    return `OpenCode Zen (${providerSettings?.models?.find((m) => m.modelId === modelId)?.nickname || modelId})`
  },
})
