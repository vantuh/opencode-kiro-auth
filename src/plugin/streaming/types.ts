export interface StreamEvent {
  type: string
  message?: any
  content_block?: any
  delta?: any
  index?: number
  usage?: any
}

export interface StreamState {
  thinkingRequested: boolean
  buffer: string
  inThinking: boolean
  thinkingExtracted: boolean
  thinkingBlockIndex: number | null
  textBlockIndex: number | null
  nextBlockIndex: number
  stoppedBlocks: Set<number>
  activeEndTag: string
}

export interface ToolCallState {
  toolUseId: string
  name: string
  input: string
}

export const THINKING_END_TAG = '</thinking>'

export const THINKING_TAG_VARIANTS: Array<{ open: string; close: string }> = [
  { open: '<thinking>', close: '</thinking>' },
  { open: '<think>', close: '</think>' },
  { open: '<reasoning>', close: '</reasoning>' },
  { open: '<thought>', close: '</thought>' }
]
