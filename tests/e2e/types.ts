export type SinkCall = {
  channel: 'telegram' | 'max';
  /** Путь запроса без адреса и query, например `/telegram/bot<токен>/sendMessage`. */
  path: string;
  query: Record<string, string>;
  body: string;
};

export type BotMessage = {
  chat_id?: number | string;
  text?: string;
};
