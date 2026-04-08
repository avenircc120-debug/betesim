import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

const VAPID_PUBLIC_KEY = "BGO4-3FJMLJTZer5CBw2hQDnxxVZgLKpPV73bJ4cFFYKpsdPwmLQFodU1O35DmQx8-Va3Yel7l9WGyAgqSVLjqk";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function getApplicationServerKey(vapidKey: string): ArrayBuffer {
  const uint8Array = urlBase64ToUint8Array(vapidKey);
  return uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength) as ArrayBuffer;
}

export function usePushNotifications() {
  const { user } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (user && "serviceWorker" in navigator) {
      checkExistingSubscription();
    }
  }, [user]);

  const checkExistingSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (error) {
      console.error("Error checking subscription:", error);
    }
  };

  const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
    if (!("serviceWorker" in navigator)) {
      console.warn("Service Worker not supported");
      return null;
    }

    try {
      // Register the push service worker
      const registration = await navigator.serviceWorker.register("/sw-push.js", {
        scope: "/"
      });
      await navigator.serviceWorker.ready;
      return registration;
    } catch (error) {
      console.error("SW registration failed:", error);
      return null;
    }
  };

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    if (!VAPID_PUBLIC_KEY) {
      console.error("VAPID public key not configured");
      return false;
    }

    setIsLoading(true);
    try {
      // Request permission
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== "granted") {
        console.log("Notification permission denied");
        return false;
      }

      // Register service worker
      const registration = await registerServiceWorker();
      if (!registration) return false;

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: getApplicationServerKey(VAPID_PUBLIC_KEY),
      });

      const subscriptionJson = subscription.toJSON();
      
      // Save subscription to database
      const { error } = await supabase.from("push_subscriptions").upsert({
        user_id: user.id,
        endpoint: subscriptionJson.endpoint!,
        p256dh: subscriptionJson.keys!.p256dh,
        auth: subscriptionJson.keys!.auth,
      }, {
        onConflict: "user_id,endpoint"
      });

      if (error) {
        console.error("Error saving subscription:", error);
        return false;
      }

      setIsSubscribed(true);
      return true;
    } catch (error) {
      console.error("Error subscribing:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!user) return false;

    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
        
        // Remove from database
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("user_id", user.id)
          .eq("endpoint", subscription.endpoint);
      }

      setIsSubscribed(false);
      return true;
    } catch (error) {
      console.error("Error unsubscribing:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  return {
    permission,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
    isSupported: "Notification" in window && "serviceWorker" in navigator,
  };
}
