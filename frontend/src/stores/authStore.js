import { create } from 'zustand'
import { authService } from '@/services/authService'

const useAuthStore = create((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (email, password, totpCode = null) => {
    set({ isLoading: true, error: null })
    try {
      const response = await authService.login(email, password, totpCode)
      const payload = JSON.parse(atob(response.access_token.split('.')[1]))
      set({
        user: { id: payload.sub, email },
        isAuthenticated: true,
        isLoading: false,
      })
      return response
    } catch (error) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  register: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      const response = await authService.register(email, password)
      set({ isLoading: false })
      return response
    } catch (error) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  logout: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    set({ user: null, isAuthenticated: false, error: null })
  },

  checkAuth: () => {
    const token = localStorage.getItem('access_token')
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        set({ user: { id: payload.sub }, isAuthenticated: true })
      } catch {
        set({ user: null, isAuthenticated: false })
      }
    }
  },
}))

export { useAuthStore }
