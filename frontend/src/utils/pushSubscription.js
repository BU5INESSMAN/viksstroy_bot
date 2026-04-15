/**
 * PWA Push Notification subscription manager.
 * Requests permission, subscribes to push, sends subscription to backend.
 */

export async function subscribeToPush(tgId) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        return false;
    }

    try {
        const response = await fetch('/api/push/vapid-key');
        if (!response.ok) return false;
        const { public_key } = await response.json();
        if (!public_key) return false;

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return false;

        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
            const applicationServerKey = urlBase64ToUint8Array(public_key);
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey,
            });
        }

        const subJson = subscription.toJSON();
        const formData = new URLSearchParams();
        formData.append('tg_id', String(tgId));
        formData.append('endpoint', subJson.endpoint);
        formData.append('p256dh', subJson.keys.p256dh);
        formData.append('auth', subJson.keys.auth);

        await fetch('/api/push/subscribe', {
            method: 'POST',
            body: formData,
            credentials: 'include',
        });
        return true;
    } catch (error) {
        console.warn('Push subscription failed:', error);
        return false;
    }
}

export async function unsubscribeFromPush() {
    try {
        if (!('serviceWorker' in navigator)) return;
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        if (subscription) {
            const formData = new URLSearchParams();
            formData.append('endpoint', subscription.endpoint);
            await fetch('/api/push/unsubscribe', { method: 'POST', body: formData, credentials: 'include' });
            await subscription.unsubscribe();
        }
    } catch (error) {
        console.warn('Push unsubscribe failed:', error);
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
