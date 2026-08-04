import { useEffect, useRef } from "react";

let ws = null;
let reconnectTimer = null;
let currentToken = null;

export function initWebSocket(token) {
  if (!token) return;
  currentToken = token;

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  let host = window.location.host;

  if (process.env.REACT_APP_BACKEND_URL) {
    host = process.env.REACT_APP_BACKEND_URL.replace(/^https?:\/\//, "");
  }

  const wsUrl = `${proto}://${host}/api/ws?token=${token}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("WebSocket connected successfully");
    window.isWsConnected = true;
    window.dispatchEvent(new CustomEvent("ws:status_connected"));
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg && msg.event) {
        console.log("WS Event received:", msg.event, msg.data);
        const customEvent = new CustomEvent(`ws:${msg.event}`, { detail: msg.data });
        window.dispatchEvent(customEvent);
      }
    } catch (e) {
      console.error("WS message parse error:", e);
    }
  };

let retryCount = 0;
const MAX_RETRIES = 3;

  ws.onclose = (e) => {
    console.log("WebSocket connection closed:", e.reason);
    window.isWsConnected = false;
    window.dispatchEvent(new CustomEvent("ws:status_disconnected"));
    if (ws !== null && currentToken && retryCount < MAX_RETRIES) {
      retryCount++;
      const delay = Math.min(10000 * retryCount, 30000);
      reconnectTimer = setTimeout(() => initWebSocket(currentToken), delay);
    }
  };

  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
    window.isWsConnected = false;
    window.dispatchEvent(new CustomEvent("ws:status_disconnected"));
    ws.close();
  };
}

export function closeWebSocket() {
  currentToken = null;
  window.isWsConnected = false;
  window.dispatchEvent(new CustomEvent("ws:status_disconnected"));
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    const tempWs = ws;
    ws = null;
    tempWs.close();
  }
}

export function useWebSocketListener(eventName, callback) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    let pollingInterval = null;

    const handler = (event) => {
      if (callbackRef.current) {
        callbackRef.current(event.detail);
      }
    };

    window.addEventListener(`ws:${eventName}`, handler);

    const startPollingIfNeeded = () => {
      if (!window.isWsConnected && !pollingInterval) {
        pollingInterval = setInterval(() => {
          if (callbackRef.current) {
            callbackRef.current();
          }
        }, 5000); // Polling every 5 seconds as a robust backup
      }
    };

    const stopPolling = () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    };

    startPollingIfNeeded();

    const onWsConnected = () => {
      stopPolling();
    };

    const onWsDisconnected = () => {
      startPollingIfNeeded();
    };

    window.addEventListener("ws:status_connected", onWsConnected);
    window.addEventListener("ws:status_disconnected", onWsDisconnected);

    return () => {
      window.removeEventListener(`ws:${eventName}`, handler);
      window.removeEventListener("ws:status_connected", onWsConnected);
      window.removeEventListener("ws:status_disconnected", onWsDisconnected);
      stopPolling();
    };
  }, [eventName]);
}
