'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'

const WebSocketContext = createContext(null)
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws'

export function useWebSocket() {
  return useContext(WebSocketContext)
}

export function WebSocketProvider({ children }) {
  const wsRef = useRef(null)
  const [connected, setConnected] = useState(false)
  const subscriptionsRef = useRef(new Map())
  const reconnectTimeoutRef = useRef(null)

  const connect = useCallback(() => {
    const token = localStorage.getItem('access_token')
    const url = token ? `${WS_BASE}?token=${encodeURIComponent(token)}` : WS_BASE
    const ws = new WebSocket(url)

    ws.onopen = () => {
      setConnected(true)
      // Re-subscribe to all channels
      subscriptionsRef.current.forEach((handler, channel) => {
        ws.send(JSON.stringify({ type: 'subscribe', channel }))
      })
    }

    ws.onclose = () => {
      setConnected(false)
      // Auto-reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(connect, 3000)
    }

    ws.onerror = () => {
      ws.close()
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        const { channel } = data
        const handlers = subscriptionsRef.current.get(channel)
        if (handlers) {
          handlers.forEach(handler => handler(data))
        }
      } catch (e) {
        console.error('WebSocket message error:', e)
      }
    }

    wsRef.current = ws
  }, [])

  useEffect(() => {
    connect()
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [connect])

  const subscribe = useCallback((channel, handler) => {
    if (!subscriptionsRef.current.has(channel)) {
      subscriptionsRef.current.set(channel, new Set())
    }
    subscriptionsRef.current.get(channel).add(handler)

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', channel }))
    }

    return () => {
      const handlers = subscriptionsRef.current.get(channel)
      if (handlers) {
        handlers.delete(handler)
        if (handlers.size === 0) {
          subscriptionsRef.current.delete(channel)
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'unsubscribe', channel }))
          }
        }
      }
    }
  }, [])

  const unsubscribe = useCallback((channel) => {
    subscriptionsRef.current.delete(channel)
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'unsubscribe', channel }))
    }
  }, [])

  return (
    <WebSocketContext.Provider value={{ connected, subscribe, unsubscribe }}>
      {children}
    </WebSocketContext.Provider>
  )
}
