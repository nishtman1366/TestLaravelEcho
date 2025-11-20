import axios from 'axios';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

window.Pusher = Pusher;

import { API_ENDPOINTS, CHANNELS, EVENTS, BASE_URL } from './constants.js';

// --- axios instance با تنظیمات مشترک ---
const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
  // xsrfCookieName: 'XSRF-TOKEN',
  // xsrfHeaderName: 'X-XSRF-TOKEN',
});

// --- تابع login با گوگل ---
export async function login() {
  try {
    // CSRF
    await api.get(API_ENDPOINTS.CSRF);

    const res = await api.post('/login/google');
    const data = res.data;
    console.log('Login response:', data);

    if (data.url) {
      window.location.href = data.url;
    }
  } catch (err) {
    console.error('Login failed:', err);
  }
}

// --- گرفتن کاربر فعلی (برای پایداری لاگین بعد از رفرش) ---
async function getCurrentUser() {
  try {
    await api.get(API_ENDPOINTS.CSRF);
    const res = await api.get(API_ENDPOINTS.USER_INFO);
    const user = res.data;
    if (!user || !user.id) return null;
    return user;
  } catch (e) {
    return null;
  }
}

// --- تابع logout ---
async function logout() {
  try {
    await api.get(API_ENDPOINTS.CSRF);
    await api.post('logout');
  } catch (e) {
    console.error('Logout error:', e);
  } finally {
    document.getElementById('logged').classList.add('hidden');
    document.getElementById('step1').classList.remove('hidden');
    document.getElementById('step2').classList.add('hidden');
  }
}

// --- بررسی callback oauth ---
async function handleOAuthCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  if (window.location.pathname === '/oauth/google/callback') {
    try {
      await api.get(API_ENDPOINTS.CSRF);
      const res = await api.get(
        '/login/google/callback' + window.location.search,
      );
      const data = res.data;
      console.log('OAuth callback response:', data);
    } catch (err) {
      console.error('OAuth callback error:', err);
    }
  }
}

// --- تابع برای render کردن نوتیف ---
function renderNotification(e) {
  const container = document.getElementById('notifications');
  if (!container) return;

  const notification = document.createElement('div');
  notification.classList.add(
    'border',
    'border-gray-300',
    'rounded-md',
    'px-3',
    'py-2',
    'mt-4',
    'flex',
    'items-start',
    'gap-3',
  );

  if (e.notification?.icon) {
    const icon = document.createElement('img');
    icon.src = e.notification.icon;
    icon.classList.add('w-10', 'h-10', 'object-cover', 'rounded-md');
    notification.appendChild(icon);
  }

  const textWrapper = document.createElement('div');
  const title = document.createElement('h2');
  title.classList.add('text-lg', 'font-semibold');
  title.innerText = e.notification?.title ?? '-';

  const body = document.createElement('p');
  body.classList.add('text-sm', 'opacity-80');
  body.innerText = e.notification?.body ?? '-';

  textWrapper.appendChild(title);
  textWrapper.appendChild(body);
  notification.appendChild(textWrapper);
  container.appendChild(notification);
}

function getCsrfTokenFromCookie() {
  return document.cookie
    .split('; ')
    .find((row) => row.startsWith('XSRF-TOKEN='))
    ?.split('=')[1];
}

// تست مستقیم auth برادکست با axios
async function testBroadcastAuthDirect() {
  try {
    await api.get(API_ENDPOINTS.CSRF);

    const res = await api.post('broadcasting/auth', {
      channel_name: 'private-user.1', // کانال تستی
      socket_id: 'test-socket-id',
    });

    console.log('broadcasting/auth status:', res.status);
    console.log('broadcasting/auth response:', res.data);
  } catch (err) {
    if (err.response) {
      console.log('broadcasting/auth status:', err.response.status);
      console.log('broadcasting/auth response:', err.response.data);
    } else {
      console.error('broadcasting/auth error:', err);
    }
  }
}

// --- تابع setup Echo و کانال‌ها ---
async function setupEcho(userId) {
  // فرض می‌گیریم CSRF قبلاً گرفته شده (getCurrentUser یا login)
  const csrfToken = getCsrfTokenFromCookie();

  const echo = new Echo({
    broadcaster: 'reverb',
    key: 'il1eyh9y7kajcflz5itj',
    wsHost: 'api.dev.jaskme.ir',
    wsPort: false,
    wssPort: false,
    forceTLS: true,
    enabledTransports: ['ws', 'wss'],

    authEndpoint: BASE_URL + 'broadcasting/auth',

    authorizer: (channel, options) => {
      return {
        authorize: async (socketId, callback) => {
          api
            .get(API_ENDPOINTS.CSRF)
            .then((response) => {
              const csrf = getCsrfTokenFromCookie();
              console.log('CSRF token cookie:', csrf);
              api
                .post(
                  'api/broadcasting/auth',
                  {
                    socket_id: socketId,
                    channel_name: channel.name,
                  },
                  {
                    headers: {
                      'X-XSRF-TOKEN': csrf ? decodeURIComponent(csrf) : '',
                      Referer: 'http://127.0.0.1:8000/',
                    },
                  },
                )
                .then((response) => {
                  callback(false, response.data);
                })
                .catch((error) => {
                  console.error('Auth error:', error);
                  callback(true, error);
                });
            })
            .catch((error) => console.error('CSRF error:', error));
        },
      };
    },

    auth: {
      headers: {
        Referer: 'http://127.0.0.1:8000/',
      },
      withCredentials: true,
    },

    withCredentials: true,
  });

  echo
    .channel(CHANNELS.PUBLIC)
    .listen(`.${EVENTS.PUBLIC_NOTIFICATION}`, (e) => renderNotification(e));

  echo
    .private(`${CHANNELS.PRIVATE_PREFIX}${userId}`)
    .subscribed(() => console.log('User subscribed to private channel'))
    .listen(`.${EVENTS.PRIVATE_NOTIFICATION}`, (e) => renderNotification(e));

  return echo;
}

// --- Event listener فرم‌ها ---
document.getElementById('step1').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  await api.get(API_ENDPOINTS.CSRF);

  const form = new FormData(ev.target);
  await api.post(API_ENDPOINTS.LOGIN_STEP1, form);

  document.getElementById('step1').classList.add('hidden');
  document.getElementById('step2').classList.remove('hidden');
});

document.getElementById('step2').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  await api.get(API_ENDPOINTS.CSRF);

  const form = new FormData(ev.target);
  const res = await api.post(API_ENDPOINTS.LOGIN_STEP2, form);
  const user = res.data;

  console.log('Logged in user:', user);

  await setupEcho(user.id);

  document.getElementById('step2').classList.add('hidden');
  document.getElementById('logged').classList.remove('hidden');
});

// --- Load listener برای OAuth callback + چک وضعیت لاگین ---
window.addEventListener('load', async () => {
  await handleOAuthCallback();

  const user = await getCurrentUser();
  if (user && user.id) {
    document.getElementById('step1').classList.add('hidden');
    document.getElementById('step2').classList.add('hidden');
    document.getElementById('logged').classList.remove('hidden');
    document.getElementById('user-id').innerText = user.id;
    await setupEcho(user.id);
  }
});

// --- Button login ---
document.getElementById('loginBtn').addEventListener('click', login);

// --- Button logout ---
document.getElementById('logoutBtn').addEventListener('click', logout);

// برای تست دستی:
// await testBroadcastAuthDirect();
