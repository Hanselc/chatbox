import { z } from 'zod'

export const ChatFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  systemInstruction: z.string(),
  ignoreOtherInstructions: z.boolean().default(false),
  icon: z.string().optional(),
  color: z.string().optional(),
  createdAt: z.number(),
  sortOrder: z.number(),
})

export type ChatFolder = z.infer<typeof ChatFolderSchema>
