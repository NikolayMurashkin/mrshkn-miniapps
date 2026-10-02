import { REQUEST_TIMEOUT_MS } from './consts';
import { botToken, maxApiBase, ownerChatId, telegramApiBase } from './env';
import type { Platform } from './types';

const postJson = async (url: string, body: unknown, headers: Record<string, string> = {}): Promise<boolean> => {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    return response.ok;
  } catch {
    return false;
  }
};

const sendTelegram = (chatId: string | number, text: string): Promise<boolean> =>
  postJson(`${telegramApiBase()}/bot${botToken('telegram')}/sendMessage`, { chat_id: chatId, text });

const sendMax = (userId: string | number, text: string): Promise<boolean> =>
  postJson(
    `${maxApiBase()}/messages?user_id=${encodeURIComponent(String(userId))}`,
    { text },
    {
      Authorization: botToken('max'),
    },
  );

/** Сообщение клиенту ботом его платформы; false - сбой доставки (сеть, не-2xx, пустой токен). */
export const sendToClient = (platform: Platform, userId: string | number, text: string): Promise<boolean> =>
  platform === 'telegram' ? sendTelegram(userId, text) : sendMax(userId, text);

export const sendToOwner = (text: string): Promise<boolean> => {
  const chatId = ownerChatId();

  return chatId ? sendTelegram(chatId, text) : Promise.resolve(false);
};
