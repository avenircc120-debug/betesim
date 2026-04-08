import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useEffect, useRef, useCallback } from "react";

// ─── Robust Audio: uses an actual MP3-encoded beep via AudioContext ───
let audioCtxUnlocked = false;
let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!sharedAudioCtx) {
      sharedAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

function unlockAudio() {
  if (audioCtxUnlocked) return;
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume();
  }
  audioCtxUnlocked = true;
}

if (typeof window !== "undefined") {
  const events = ["touchstart", "touchend", "click", "keydown"];
  const handler = () => {
    unlockAudio();
    events.forEach((e) => document.removeEventListener(e, handler, true));
  };
  events.forEach((e) => document.addEventListener(e, handler, true));
}

function playNotificationSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;

    // Master compressor to maximize loudness without clipping
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-10, now);
    compressor.knee.setValueAtTime(0, now);
    compressor.ratio.setValueAtTime(20, now);
    compressor.attack.setValueAtTime(0, now);
    compressor.release.setValueAtTime(0.05, now);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(1.0, now); // Max volume
    masterGain.connect(compressor);
    compressor.connect(ctx.destination);

    // ─── HIT 1: Aggressive square C6 (1047 Hz) ───
    const osc1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    osc1.connect(g1); g1.connect(masterGain);
    osc1.type = "square";
    osc1.frequency.setValueAtTime(1047, now);
    g1.gain.setValueAtTime(0.9, now);
    g1.gain.linearRampToValueAtTime(0.7, now + 0.05);
    g1.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    osc1.start(now); osc1.stop(now + 0.2);

    // ─── HIT 2: Sawtooth E6 (1319 Hz) ───
    const osc2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc2.connect(g2); g2.connect(masterGain);
    osc2.type = "sawtooth";
    osc2.frequency.setValueAtTime(1319, now + 0.08);
    g2.gain.setValueAtTime(0.001, now);
    g2.gain.linearRampToValueAtTime(0.9, now + 0.08);
    g2.gain.linearRampToValueAtTime(0.6, now + 0.15);
    g2.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
    osc2.start(now + 0.08); osc2.stop(now + 0.35);

    // ─── HIT 3: Square G6 (1568 Hz) ───
    const osc3 = ctx.createOscillator();
    const g3 = ctx.createGain();
    osc3.connect(g3); g3.connect(masterGain);
    osc3.type = "square";
    osc3.frequency.setValueAtTime(1568, now + 0.18);
    g3.gain.setValueAtTime(0.001, now);
    g3.gain.linearRampToValueAtTime(0.9, now + 0.18);
    g3.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    osc3.start(now + 0.18); osc3.stop(now + 0.5);

    // ─── SUB BASS: Low punch at 220 Hz ───
    const sub = ctx.createOscillator();
    const gSub = ctx.createGain();
    sub.connect(gSub); gSub.connect(masterGain);
    sub.type = "sine";
    sub.frequency.setValueAtTime(220, now);
    gSub.gain.setValueAtTime(0.8, now);
    gSub.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    sub.start(now); sub.stop(now + 0.15);

    // ─── REPEAT: Double-hit pattern (like TikTok) ───
    const osc4 = ctx.createOscillator();
    const g4 = ctx.createGain();
    osc4.connect(g4); g4.connect(masterGain);
    osc4.type = "square";
    osc4.frequency.setValueAtTime(1568, now + 0.55);
    g4.gain.setValueAtTime(0.001, now);
    g4.gain.linearRampToValueAtTime(0.8, now + 0.55);
    g4.gain.exponentialRampToValueAtTime(0.01, now + 0.75);
    osc4.start(now + 0.55); osc4.stop(now + 0.75);

    const osc5 = ctx.createOscillator();
    const g5 = ctx.createGain();
    osc5.connect(g5); g5.connect(masterGain);
    osc5.type = "sawtooth";
    osc5.frequency.setValueAtTime(2093, now + 0.65); // C7 - high finish
    g5.gain.setValueAtTime(0.001, now);
    g5.gain.linearRampToValueAtTime(0.7, now + 0.65);
    g5.gain.exponentialRampToValueAtTime(0.01, now + 0.9);
    osc5.start(now + 0.65); osc5.stop(now + 0.9);

    console.log("[Notif] ♪ LOUD sound played (5-tone + sub bass)");
  } catch (e) {
    console.warn("[Notif] Sound error:", e);
  }

  // Aggressive vibration pattern
  try {
    if (navigator.vibrate) {
      navigator.vibrate([150, 30, 150, 30, 200, 50, 300]);
    }
  } catch {}
}

// Custom event for in-app notification banner
export function dispatchNotificationBanner(title: string, message: string, type: string = "info") {
  console.log("[Notif] Dispatching banner:", title);
  window.dispatchEvent(
    new CustomEvent("pi-notification", { detail: { title, message, type } })
  );
}

export const useNotifications = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const lastNotifIdRef = useRef<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const query = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
    enabled: !!user,
    refetchInterval: 30000, // Poll every 30s as fallback
  });

  // Track last known notification to detect new ones via polling
  useEffect(() => {
    if (!query.data || query.data.length === 0) return;
    const latestId = query.data[0].id;
    
    if (lastNotifIdRef.current && lastNotifIdRef.current !== latestId) {
      // New notification detected via polling!
      const newest = query.data[0];
      console.log("[Notif] New notification detected via poll:", newest.title);
      if (!newest.read) {
        playNotificationSound();
        dispatchNotificationBanner(newest.title, newest.message, newest.type);
      }
    }
    lastNotifIdRef.current = latestId;
  }, [query.data]);

  const unreadCount = query.data?.filter((n) => !n.read).length ?? 0;

  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").update({ read: true }).eq("id", id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!user) return;
      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const deleteNotification = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").delete().eq("id", id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const handleNewNotification = useCallback((notif: { title: string; message: string; type?: string }) => {
    console.log("[Notif] New notification received via realtime:", notif.title);
    playNotificationSound();
    dispatchNotificationBanner(notif.title, notif.message, notif.type || "info");
  }, []);

  // Realtime subscription with auto-reconnect
  useEffect(() => {
    if (!user) return;
    
    const subscribe = () => {
      console.log("[Notif] Subscribing to realtime for user:", user.id);
      
      // Clean up previous channel
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }

      const channel = supabase
        .channel(`notifications-rt-${Date.now()}`) // Unique name to avoid conflicts
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            console.log("[Notif] Realtime payload received:", payload);
            const notif = payload.new as { id: string; title: string; message: string; type: string };
            handleNewNotification(notif);
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
          }
        )
        .subscribe((status) => {
          console.log("[Notif] Realtime status:", status);
          if (status === "TIMED_OUT" || status === "CHANNEL_ERROR") {
            console.log("[Notif] Reconnecting in 5s...");
            setTimeout(subscribe, 5000);
          }
        });
      
      channelRef.current = channel;
    };

    subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user, queryClient, handleNewNotification]);

  return {
    notifications: query.data ?? [],
    unreadCount,
    isLoading: query.isLoading,
    markAsRead,
    markAllRead,
    deleteNotification,
  };
};
