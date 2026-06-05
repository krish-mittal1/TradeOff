import { apiClient } from './api'

class AuthService {
  async login(email, password, totpCode = null) {
    return apiClient.post('/auth/login', {
      email,
      password,
      totp_code: totpCode,
    })
  }

  async register(email, password) {
    return apiClient.post('/auth/register', {
      email,
      password,
    })
  }

  async refreshToken(refreshToken) {
    return apiClient.post('/auth/refresh', { refresh_token: refreshToken })
  }

  async logout(refreshToken) {
    return apiClient.post('/auth/logout', { refresh_token: refreshToken })
  }

  async setupMfa() {
    return apiClient.post('/auth/mfa/setup')
  }

  async verifyMfa(totpCode, secret) {
    return apiClient.post('/auth/mfa/verify', {
      totp_code: totpCode,
      secret,
    })
  }
}

export const authService = new AuthService()
