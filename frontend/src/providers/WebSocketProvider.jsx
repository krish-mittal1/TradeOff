'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'

const WebSocketContext = createContext(null)
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws'

// Exponential backoff: 1s → 2s → 4s → 8s → 16s → capped at 30s
const backoffMs = (attempt) => Math.min(1000 * 2 ** attempt, 30_000)

export function useWebSocket() {
  return useContext(WebSocketContext)
}

export function WebSocketProvider({ children }) {
  const wsRef = useRef(null)
  const [connected, setConnected] = useState(false)
  const subscriptionsRef = useRef(new Map())   // channel → Set<handler>
  const reconnectTimerRef = useRef(null)
  const attemptRef = useRef(0)
  const unmountedRef = useRef(false)

  // Stable connect — does not close over changing values; reads from storage at call time
  const connect = useCallback(() => {
    if (unmountedRef.current) return
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return

    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    const url = token ? `${WS_BASE}?token=${encodeURIComponent(token)}` : WS_BASE

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      if (unmountedRef.current) { ws.close(); return }
      attemptRef.current = 0          // reset backoff on success
      setConnected(true)
      // Re-subscribe to all active channels after reconnect
      subscriptionsRef.current.forEach((_, channel) => {
        try { ws.send(JSON.stringify({ type: 'subscribe', channel })) } catch {}
      })
    }

    ws.onclose = () => {
      setConnected(false)
      if (unmountedRef.current) return
      const delay = backoffMs(attemptRef.current)
      attemptRef.current += 1
      reconnectTimerRef.current = setTimeout(connect, delay)
    }

    ws.onerror = () => {
      // onclose fires right after onerror — nothing to do here
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        const channel = data?.channel
        if (!channel) return
        const handlers = subscriptionsRef.current.get(channel)
        if (handlers) handlers.forEach((h) => h(data))
      } catch {
        // Malformed message — ignore
      }
    }
  }, []) // stable — no deps

  // Mount once; reconnect when user logs in/out (token changes)
  useEffect(() => {
    unmountedRef.current = false
    connect()

    return () => {
      unmountedRef.current = true
      clearTimeout(reconnectTimerRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null   // prevent reconnect loop on deliberate close
        wsRef.current.close()
        wsRef.current = null
      }
      setConnected(false)
    }
  }, [connect])

  // When the user logs in/out reconnect immediately with the correct token
  useEffect(() => {
    if (typeof window === 'undefined') return
    function onStorageChange(e) {
      if (e.key === 'access_token') {
        clearTimeout(reconnectTimerRef.current)
        attemptRef.current = 0
        if (wsRef.current) {
          wsRef.current.onclose = null
          wsRef.current.close()
          wsRef.current = null
        }
        setConnected(false)
        connect()
      }
    }
    window.addEventListener('storage', onStorageChange)
    return () => window.removeEventListener('storage', onStorageChange)
  }, [connect])

  const subscribe = useCallback((channel, handler) => {
    if (!subscriptionsRef.current.has(channel)) {
      subscriptionsRef.current.set(channel, new Set())
    }
    subscriptionsRef.current.get(channel).add(handler)

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try { wsRef.current.send(JSON.stringify({ type: 'subscribe', channel })) } catch {}
    }

    // Return an unsubscribe function
    return () => {
      const handlers = subscriptionsRef.current.get(channel)
      if (!handlers) return
      handlers.delete(handler)
      if (handlers.size === 0) {
        subscriptionsRef.current.delete(channel)
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          try { wsRef.current.send(JSON.stringify({ type: 'unsubscribe', channel })) } catch {}
        }
      }
    }
  }, [])

  const unsubscribe = useCallback((channel) => {
    subscriptionsRef.current.delete(channel)
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try { wsRef.current.send(JSON.stringify({ type: 'unsubscribe', channel })) } catch {}
    }
  }, [])

  return (
    <WebSocketContext.Provider value={{ connected, subscribe, unsubscribe }}>
      {children}
    </WebSocketContext.Provider>
  )
}
