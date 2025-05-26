export interface BetaBaseBlock {
  type: string;
  id?: string;
  cache_control?: { type: 'ephemeral' };
}

export interface BetaTextBlock extends BetaBaseBlock {
  type: 'text';
  text: string;
}

export interface BetaImageBlock extends BetaBaseBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/png';
    data: string;
  };
}

export interface BetaToolUseBlock extends BetaBaseBlock {
  type: 'tool_use';
  name: string;
  input: Record<string, any>;
}

export interface BetaThinkingBlock extends BetaBaseBlock {
  type: 'thinking';
  thinking: any;
  signature?: string;
}

export interface BetaToolResultBlock extends BetaBaseBlock {
  type: 'tool_result';
  content: (BetaTextBlock | BetaImageBlock)[] | string;
  tool_use_id: string;
  is_error: boolean;
}

export type BetaContentBlock = BetaTextBlock | BetaImageBlock | BetaToolUseBlock | BetaThinkingBlock | BetaToolResultBlock;

export interface BetaMessageParam {
  role: 'user' | 'assistant';
  content: BetaContentBlock[] | string;
}

export interface BetaMessage {
  content: BetaContentBlock[];
} 