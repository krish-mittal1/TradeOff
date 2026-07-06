const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

class ApiClient {
  constructor() {
    this.baseUrl = API_BASE
    // Singleton refresh promise — prevents concurrent token rotations when
    // multiple requests get a 401 at the same time.
    this._refreshPromise = null
  }

  getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
    }
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    return headers
  }

  async request(method, path, body = null, params = null) {
    let url = `${this.baseUrl}${path}`

    if (params) {
      const searchParams = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          searchParams.append(key, String(value))
        }
      })
      const qs = searchParams.toString()
      if (qs) url += `?${qs}`
    }

    const buildOptions = () => ({
      method,
      headers: this.getHeaders(),
      ...(body != null ? { body: JSON.stringify(body) } : {}),
    })

    try {
      const response = await fetch(url, buildOptions())

      if (response.status === 401) {
        // Coalesce concurrent 401s into one refresh attempt
        if (!this._refreshPromise) {
          this._refreshPromise = this._doRefresh().finally(() => {
            this._refreshPromise = null
          })
        }
        const refreshed = await this._refreshPromise
        if (refreshed) {
          // Retry with the new token
          const retryResponse = await fetch(url, buildOptions())
          return this._handleResponse(retryResponse)
        }
        throw new ApiError('Session expired. Please log in again.', 401)
      }

      return this._handleResponse(response)
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw new ApiError(error.message || 'Network error', 0)
    }
  }

  async _handleResponse(response) {
    const contentType = response.headers.get('content-type') || ''
    const data = contentType.includes('application/json') ? await response.json() : null
    if (!response.ok) {
      throw new ApiError(data?.detail || data?.message || `Request failed (${response.status})`, response.status)
    }
    return data
  }

  async _doRefresh() {
    if (typeof window === 'undefined') return false
    const refreshToken = localStorage.getItem('refresh_token')
    if (!refreshToken) return false

    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })

      if (!response.ok) {
        // Refresh failed — clear tokens so the UI shows the login prompt
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        return false
      }

      const data = await response.json()
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('refresh_token', data.refresh_token)
      return true
    } catch {
      return false
    }
  }

  get(path, params) { return this.request('GET', path, null, params) }
  post(path, body) { return this.request('POST', path, body) }
  put(path, body) { return this.request('PUT', path, body) }
  patch(path, body) { return this.request('PATCH', path, body) }
  delete(path, params) { return this.request('DELETE', path, null, params) }
}

class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

export const apiClient = new ApiClient()
export { ApiError }
