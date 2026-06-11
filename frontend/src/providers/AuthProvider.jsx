'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { authService } from '@/services/authService'
import { apiClient } from '@/services/api'

const AuthContext = createContext(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check for existing session
    const token = localStorage.getItem('access_token')
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        setUser({ id: payload.sub, role: payload.role })
      } catch {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
      }
    }
    setLoading(false)
  }, [])

  const bootstrapDemo = useCallback(async () => {
    try {
      return await apiClient.post('/demo/bootstrap')
    } catch (error) {
      console.warn('Demo bootstrap failed', error)
      return null
    }
  }, [])

  useEffect(() => {
    if (user) bootstrapDemo()
  }, [user, bootstrapDemo])

  const login = useCallback(async (email, password, totpCode = null) => {
    const response = await authService.login(email, password, totpCode)
    localStorage.setItem('access_token', response.access_token)
    localStorage.setItem('refresh_token', response.refresh_token)
    const payload = JSON.parse(atob(response.access_token.split('.')[1]))
    setUser({ id: payload.sub, role: payload.role })
    await bootstrapDemo()
    return response
  }, [bootstrapDemo])

  const register = useCallback(async (email, password, referralCode = null) => {
    const response = await authService.register(email, password, referralCode)
    localStorage.setItem('access_token', response.access_token)
    localStorage.setItem('refresh_token', response.refresh_token)
    const payload = JSON.parse(atob(response.access_token.split('.')[1]))
    setUser({ id: payload.sub, role: payload.role })
    await bootstrapDemo()
    return response
  }, [bootstrapDemo])

  const logout = useCallback(() => {
    const refreshToken = localStorage.getItem('refresh_token')
    if (refreshToken) authService.logout(refreshToken).catch(() => {})
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, bootstrapDemo, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  )
}
