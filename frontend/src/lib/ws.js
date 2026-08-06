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
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    if (process.env.REACT_APP_BACKEND_URL) {
      host = process.env.REACT_APP_BACKEND_URL.replace(/^https?:\/\//, "").replace(/\/api\/?$/, "");
    } else {
      host = `${window.location.hostname}:8000`;
    }
  }

  const wsUrl = `${proto}://${host}/api/ws?token=${token}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    window.isWsConnected = true;
    window.dispatchEvent(new CustomEvent("ws:status_connected"));
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg && msg.event) {
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
    window.isWsConnected = false;
    window.dispatchEvent(new CustomEvent("ws:status_disconnected"));
    if (ws !== null && currentToken && retryCount < MAX_RETRIES) {
      retryCount++;
      const delay = Math.min(10000 * retryCount, 30000);
      reconnectTimer = setTimeout(() => initWebSocket(currentToken), delay);
    }
  };

  ws.onerror = (err) => {
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
    const handler = (event) => {
      if (callbackRef.current) {
        callbackRef.current(event.detail);
      }
    };

    window.addEventListener(`ws:${eventName}`, handler);

    return () => {
      window.removeEventListener(`ws:${eventName}`, handler);
    };
  }, [eventName]);
}
