import axios from 'axios';

function base64urlToBuffer(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = window.atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bufferToBase64url(value) {
  if (value === null || value === undefined) return null;
  const bytes = new Uint8Array(value);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function creationOptionsFromJSON(options) {
  return {
    ...options,
    challenge: base64urlToBuffer(options.challenge),
    user: { ...options.user, id: base64urlToBuffer(options.user.id) },
    excludeCredentials: (options.excludeCredentials || []).map((item) => ({
      ...item,
      id: base64urlToBuffer(item.id),
    })),
  };
}

function requestOptionsFromJSON(options) {
  return {
    ...options,
    challenge: base64urlToBuffer(options.challenge),
    allowCredentials: (options.allowCredentials || []).map((item) => ({
      ...item,
      id: base64urlToBuffer(item.id),
    })),
  };
}

function credentialToJSON(credential) {
  const response = credential.response;
  const data = {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment || undefined,
    clientExtensionResults: credential.getClientExtensionResults?.() || {},
    response: {
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
    },
  };
  if ('attestationObject' in response) {
    data.response.attestationObject = bufferToBase64url(response.attestationObject);
    data.response.transports = response.getTransports?.() || [];
  } else {
    data.response.authenticatorData = bufferToBase64url(response.authenticatorData);
    data.response.signature = bufferToBase64url(response.signature);
    data.response.userHandle = bufferToBase64url(response.userHandle);
  }
  return data;
}

export function passkeysSupported() {
  return window.isSecureContext
    && typeof window.PublicKeyCredential !== 'undefined'
    && !!navigator.credentials?.create
    && !!navigator.credentials?.get;
}

export async function registerPasskey(name) {
  if (!passkeysSupported()) throw new Error('Ключи доступа не поддерживаются на этом устройстве');
  const optionsRes = await axios.post('/api/auth/passkeys/register/options');
  const credential = await navigator.credentials.create({
    publicKey: creationOptionsFromJSON(optionsRes.data.publicKey),
  });
  if (!credential) throw new Error('Создание ключа отменено');
  const verifyRes = await axios.post('/api/auth/passkeys/register/verify', {
    challenge_id: optionsRes.data.challenge_id,
    credential: credentialToJSON(credential),
    name,
  });
  return verifyRes.data;
}

export async function loginWithPasskey() {
  if (!passkeysSupported()) throw new Error('Ключи доступа не поддерживаются на этом устройстве');
  const optionsRes = await axios.post('/api/auth/passkeys/login/options');
  const credential = await navigator.credentials.get({
    publicKey: requestOptionsFromJSON(optionsRes.data.publicKey),
  });
  if (!credential) throw new Error('Вход по ключу отменён');
  const verifyRes = await axios.post('/api/auth/passkeys/login/verify', {
    challenge_id: optionsRes.data.challenge_id,
    credential: credentialToJSON(credential),
  });
  return verifyRes.data;
}
