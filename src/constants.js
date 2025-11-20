export const API_ENDPOINTS = {
  CSRF: 'api/csrf-cookie',
  LOGIN_STEP1: 'login',
  LOGIN_STEP2: 'otp',
  USER_INFO: 'api/v1/user',
};

export const CHANNELS = {
  PUBLIC: 'global.notifications',
  PRIVATE_PREFIX: 'user.',
};

export const EVENTS = {
  PUBLIC_NOTIFICATION: 'WebNotificationSentEvent',
  PRIVATE_NOTIFICATION: 'PrivateNotificationEvent',
};

export const BASE_URL = 'https://api.dev.jaskme.ir/';
// export const BASE_URL = 'http://127.0.0.1:8001/';