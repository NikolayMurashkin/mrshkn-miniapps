import { DEFAULT_MAX_API_BASE, DEFAULT_TELEGRAM_API_BASE } from './consts';
import type { Platform } from './types';

export const botToken = (platform: Platform): string =>
  (platform === 'telegram' ? process.env.TELEGRAM_BOT_TOKEN : process.env.MAX_BOT_TOKEN) ?? '';

export const ownerChatId = (): string => process.env.OWNER_TELEGRAM_CHAT_ID ?? '';

export const crmWebhookUrl = (): string => process.env.CRM_WEBHOOK_URL ?? '';

export const telegramApiBase = (): string => process.env.TELEGRAM_API_BASE || DEFAULT_TELEGRAM_API_BASE;

export const maxApiBase = (): string => process.env.MAX_API_BASE || DEFAULT_MAX_API_BASE;
