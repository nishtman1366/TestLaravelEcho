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
});

// --- تابع login با گوگل ---
export async function login() {
  const btn = document.getElementById('loginBtn');
  try {
    setButtonLoading(btn, true);
    await api.get(API_ENDPOINTS.CSRF);

    const res = await api.post('/login/google');
    const data = res.data;
    console.log('Login response:', data);

    if (data.url) {
      window.location.href = data.url;
    }
  } catch (err) {
    console.error('Login failed:', err);
    showInlineMessage('ورود با گوگل با خطا مواجه شد.', 'error');
  } finally {
    setButtonLoading(btn, false);
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
    // نمایش مجدد فرم مرحله اول و ریست بقیه
    toggleSteps({ step1: true, step2: false, logged: false });
    clearNotifications();
  }
}

// --- بررسی callback oauth ---
async function handleOAuthCallback() {
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
      showInlineMessage('تأیید ورود با گوگل با خطا مواجه شد.', 'error');
    }
  }
}

function showInlineMessage(message, type = 'info') {
  const container = document.getElementById('notifications');
  if (!container) return;

  const item = document.createElement('div');
  item.classList.add(
    'notification-item',
    type === 'error' ? 'error' : 'success',
  );

  const textWrapper = document.createElement('div');
  textWrapper.classList.add('notification-text');

  const title = document.createElement('div');
  title.classList.add('notification-title');
  title.textContent = message;

  textWrapper.appendChild(title);
  item.appendChild(textWrapper);

  container.appendChild(item);
  container.scrollTop = container.scrollHeight;
}

// --- پاک کردن نوتیف‌ها ---
function clearNotifications() {
  const container = document.getElementById('notifications');
  if (!container) return;
  container.innerHTML = '';
}

// --- تابع برای render کردن نوتیف از سرور (با آیکن) ---
function renderNotification(e) {
  const container = document.getElementById('notifications');
  if (!container) return;

  const item = document.createElement('div');
  item.classList.add('notification-item', 'success');

  const iconUrl = e.notification?.icon;
  if (iconUrl) {
    const icon = document.createElement('img');
    icon.src = iconUrl;
    icon.alt = 'notification icon';
    icon.classList.add('notification-icon');
    item.appendChild(icon);
  }

  const textWrapper = document.createElement('div');
  textWrapper.classList.add('notification-text');

  const title = document.createElement('div');
  title.classList.add('notification-title');
  title.textContent = e.notification?.title ?? '-';

  const body = document.createElement('div');
  body.classList.add('notification-body');
  body.textContent = e.notification?.body ?? '-';

  textWrapper.appendChild(title);
  textWrapper.appendChild(body);

  item.appendChild(textWrapper);
  container.appendChild(item);

  // اسکرول به آخرین نوتیف
  container.scrollTop = container.scrollHeight;
}

// --- Helper: وضعیت لودینگ دکمه ---
function setButtonLoading(button, isLoading) {
  if (!button) return;

  if (isLoading) {
    if (button.classList.contains('is-loading')) return;

    button.classList.add('is-loading');

    const spinner = document.createElement('div');
    spinner.classList.add('btn-spinner');
    button.appendChild(spinner);
  } else {
    button.classList.remove('is-loading');
    const spinner = button.querySelector('.btn-spinner');
    if (spinner) spinner.remove();
  }
}

function getCsrfTokenFromCookie() {
  return document.cookie
    .split('; ')
    .find((row) => row.startsWith('XSRF-TOKEN='))
    ?.split('=')[1];
}

// --- تابع setup Echo و کانال‌ها ---
async function setupEcho(userId) {
  const echo = new Echo({
    broadcaster: 'reverb',
    key: 'il1eyh9y7kajcflz5itj',
    wsHost: 'api.dev.jaskme.ir',
    wsPort: false,
    wssPort: false,
    forceTLS: true,
    enabledTransports: ['ws', 'wss'],

    authEndpoint: BASE_URL + 'broadcasting/auth',

    authorizer: (channel) => {
      return {
        authorize: async (socketId, callback) => {
          api
            .get(API_ENDPOINTS.CSRF)
            .then(() => {
              const csrf = getCsrfTokenFromCookie();
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
    .listen(`.${EVENTS.PUBLIC_NOTIFICATION}`, (e) => {
      renderNotification(e);
      showNativeNotification(e);
    });

  echo
    .private(`${CHANNELS.PRIVATE_PREFIX}${userId}`)
    .subscribed(() => console.log('User subscribed to private channel'))
    .listen(`.${EVENTS.PRIVATE_NOTIFICATION}`, (e) => {
      renderNotification(e);
      showNativeNotification(e);
    });

  return echo;
}

// --- کمک‌کننده برای مدیریت حالت فرم‌ها ---
function toggleSteps({ step1, step2, logged }) {
  const step1El = document.getElementById('step1');
  const step2El = document.getElementById('step2');
  const loggedEl = document.getElementById('logged');

  if (!step1El || !step2El || !loggedEl) return;

  // پنهان‌کردن / نمایش با hidden
  step1El.classList.toggle('hidden', !step1);
  step2El.classList.toggle('hidden', !step2);
  loggedEl.classList.toggle('hidden', !logged);

  // کنترل کلاس انیمیشن فرم‌ها
  step1El.classList.toggle('step-form--active', step1);
  step2El.classList.toggle('step-form--active', step2);
}

// --- Event listener فرم‌ها ---
document.getElementById('step1')?.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  clearNotifications();

  const submitBtn = document.getElementById('step1Submit');

  try {
    setButtonLoading(submitBtn, true);
    await api.get(API_ENDPOINTS.CSRF);

    const form = new FormData(ev.target);
    await api.post(API_ENDPOINTS.LOGIN_STEP1, form);

    toggleSteps({ step1: false, step2: true, logged: false });
    showInlineMessage('کد تأیید ارسال شد.', 'success');
  } catch (error) {
    console.error('Step1 login error:', error);
    showInlineMessage('خطا در ارسال کد تأیید. لطفاً دوباره تلاش کنید.', 'error');
  } finally {
    setButtonLoading(submitBtn, false);
  }
});

document.getElementById('step2')?.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  clearNotifications();

  const submitBtn = document.getElementById('step2Submit');

  try {
    setButtonLoading(submitBtn, true);
    await api.get(API_ENDPOINTS.CSRF);

    const form = new FormData(ev.target);
    const res = await api.post(API_ENDPOINTS.LOGIN_STEP2, form);
    const user = res.data;

    console.log('Logged in user:', user);

    const userIdSpan = document.getElementById('user-id');
    if (userIdSpan) {
      userIdSpan.innerText = user.id;
    }

    await requestNotificationPermission();
    await setupEcho(user.id);

    toggleSteps({ step1: false, step2: false, logged: true });
    showInlineMessage('ورود با موفقیت انجام شد.', 'success');
  } catch (error) {
    console.error('Step2 login error:', error);
    showInlineMessage('کد تأیید نامعتبر است یا خطا رخ داده است.', 'error');
  } finally {
    setButtonLoading(submitBtn, false);
  }
});

// --- دکمه بازگشت از مرحله ۲ به ۱ ---
document.getElementById('backToStep1')?.addEventListener('click', () => {
  toggleSteps({ step1: true, step2: false, logged: false });
  clearNotifications();
});

// --- Load listener برای OAuth callback + چک وضعیت لاگین ---
window.addEventListener('load', async () => {
  await handleOAuthCallback();

  const user = await getCurrentUser();
  if (user && user.id) {
    document.getElementById('user-id').innerText = user.id;

    await requestNotificationPermission();
    await setupEcho(user.id);

    toggleSteps({ step1: false, step2: false, logged: true });
  } else {
    toggleSteps({ step1: true, step2: false, logged: false });
  }
});

async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert('مرورگر شما از نوتیف پشتیبانی نمی‌کند');
    return false;
  }

  let permission = Notification.permission;

  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }

  return permission === 'granted';
}

function showNativeNotification(e) {
  if (Notification.permission !== 'granted') {
    console.log('Permission not granted');
    return;
  }

  new Notification(e.notification?.title ?? 'پیام جدید', {
    body: e.notification?.body ?? '',
    icon: e.notification?.icon ?? undefined,
  });
}

// --- Button login ---
document.getElementById('loginBtn')?.addEventListener('click', login);

// --- Button logout ---
document.getElementById('logoutBtn')?.addEventListener('click', logout);
