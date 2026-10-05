import { NextResponse } from 'next/server';
import { ROBOTS_TAG } from './lib/consts';

/** Каждый ответ экземпляра — страницы, API, админка — закрыт от индексации заголовком. */
const proxy = () => {
  const response = NextResponse.next();

  response.headers.set('X-Robots-Tag', ROBOTS_TAG);

  return response;
};

export default proxy;
