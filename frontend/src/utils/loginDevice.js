import axios from 'axios';

const DEVICE_TOKEN_KEY = 'viks_login_device';
const DEVICE_ID_KEY = 'viks_login_device_id';

export function getLoginDeviceToken() {
  try { return localStorage.getItem(DEVICE_TOKEN_KEY) || ''; } catch { return ''; }
}

export function getLoginDeviceId() {
  try { return Number(localStorage.getItem(DEVICE_ID_KEY)) || null; } catch { return null; }
}

export function getDeviceName() {
  const ua = navigator.userAgent || '';
  let platform = 'Браузер';
  if (/iPhone/i.test(ua)) platform = 'iPhone';
  else if (/iPad/i.test(ua)) platform = 'iPad';
  else if (/Android/i.test(ua)) platform = 'Android';
  else if (/Windows/i.test(ua)) platform = 'Windows';
  else if (/Macintosh|Mac OS/i.test(ua)) platform = 'Mac';
  else if (/Linux/i.test(ua)) platform = 'Linux';
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  return `${platform}${standalone ? ' · PWA' : ' · сайт'}`;
}

export async function ensureLoginDevice() {
  const fd = new FormData();
  fd.append('device_token', getLoginDeviceToken());
  fd.append('device_name', getDeviceName());
  const res = await axios.post('/api/auth/devices/register', fd);
  const token = res.data?.device_token;
  if (token) {
    try {
      localStorage.setItem(DEVICE_TOKEN_KEY, token);
      if (res.data?.device_id) localStorage.setItem(DEVICE_ID_KEY, String(res.data.device_id));
    } catch { /* private mode */ }
  }
  return token || '';
}

export function forgetLoginDevice() {
  try {
    localStorage.removeItem(DEVICE_TOKEN_KEY);
    localStorage.removeItem(DEVICE_ID_KEY);
  } catch { /* silent */ }
}

export { DEVICE_TOKEN_KEY, DEVICE_ID_KEY };
