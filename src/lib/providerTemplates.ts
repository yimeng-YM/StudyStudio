/**
 * 供应商预设模板。
 * 每个模板预填了主流 OpenAI 兼容供应商的显示名称与基础地址，apiKey 留空由用户填写。
 * 用于「新增供应商」时一键套用，免去手动查找接口地址。
 */
export interface ProviderTemplate {
  /** 供应商显示名称 */
  name: string;
  /** OpenAI 兼容接口基础地址（已含版本段） */
  baseUrl: string;
  /** 可选的简短说明，展示在模板按钮上 */
  description?: string;
}

/**
 * 内置供应商模板列表。
 * baseUrl 均为各厂商官方 OpenAI 兼容端点；版本段各异（/v1、/v3、/v4），
 * 由 ai.ts 的 normalizeBaseUrl 智能识别，不会误补 /v1。
 */
export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  { name: 'KouriChat', baseUrl: 'https://api.kourichat.com/v1', description: '默认' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  { name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { name: '字节豆包', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' },
  { name: '月之暗面 Kimi', baseUrl: 'https://api.moonshot.cn/v1' },
  { name: 'MiniMax', baseUrl: 'https://api.minimaxi.com/v1' },
];

/** 默认供应商的基础地址（首次初始化与回退时使用） */
export const DEFAULT_PROVIDER_BASE_URL = 'https://api.kourichat.com/v1';
/** 默认供应商名称 */
export const DEFAULT_PROVIDER_NAME = 'KouriChat';