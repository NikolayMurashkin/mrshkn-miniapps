import { DEFAULT_ADMIN_TITLE, DEFAULT_MAX_API_BASE, DEFAULT_TELEGRAM_API_BASE } from './consts';
import type { Platform } from './types';

export const botToken = (platform: Platform): string =>
  (platform === 'telegram' ? process.env.TELEGRAM_BOT_TOKEN : process.env.MAX_BOT_TOKEN) ?? '';

export const ownerChatId = (): string => process.env.OWNER_TELEGRAM_CHAT_ID ?? '';

export const crmWebhookUrl = (): string => process.env.CRM_WEBHOOK_URL ?? '';

export const telegramApiBase = (): string => process.env.TELEGRAM_API_BASE || DEFAULT_TELEGRAM_API_BASE;

export const maxApiBase = (): string => process.env.MAX_API_BASE || DEFAULT_MAX_API_BASE;

/** Имя бота для реферальной ссылки; пусто — ссылки нет. */
export const botUsername = (platform: Platform): string =>
  ((platform === 'telegram' ? process.env.TELEGRAM_BOT_USERNAME : process.env.MAX_BOT_USERNAME) ?? '').trim();

/** Публичный демо-экземпляр студии: флаг включает только строка `true`, читается на каждом запросе. */
export const isDemoInstance = (): boolean => process.env.DEMO_INSTANCE === 'true';

/** Название экземпляра в заголовке вкладки админки; пусто — общее имя. */
export const adminTitleSuffix = (): string => ` · ${process.env.ADMIN_TITLE?.trim() || DEFAULT_ADMIN_TITLE}`;
