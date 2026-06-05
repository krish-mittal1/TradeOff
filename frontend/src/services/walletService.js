import { apiClient } from './api'

class WalletService {
  async getBalances() {
    return apiClient.get('/wallets/balances')
  }

  async getBalance(asset) {
    return apiClient.get(`/wallets/balances/${asset.toUpperCase()}`)
  }

  async getDeposits(params = {}) {
    return apiClient.get('/wallets/deposits', params)
  }

  async getWithdrawals(params = {}) {
    return apiClient.get('/wallets/withdrawals', params)
  }

  async getDepositAddress(asset) {
    return apiClient.get(`/wallets/deposit-address/${asset.toUpperCase()}`)
  }

  async createMockDeposit(asset, amount, confirmations = 0) {
    return apiClient.post('/wallets/deposits/mock', {
      asset_symbol: asset.toUpperCase(),
      amount,
      confirmations,
    })
  }

  async confirmDeposit(depositId, confirmations = 1) {
    return apiClient.post(`/wallets/deposits/${depositId}/confirm`, { confirmations })
  }

  async createWithdrawal(asset, address, amount) {
    return apiClient.post('/wallets/withdrawals', {
      asset_symbol: asset.toUpperCase(),
      address,
      amount,
    })
  }

  async broadcastWithdrawal(withdrawalId) {
    return apiClient.post(`/wallets/withdrawals/${withdrawalId}/broadcast`)
  }

  async completeWithdrawal(withdrawalId) {
    return apiClient.post(`/wallets/withdrawals/${withdrawalId}/complete`)
  }

  async cancelWithdrawal(withdrawalId) {
    return apiClient.post(`/wallets/withdrawals/${withdrawalId}/cancel`)
  }

  async getPortfolioSummary() {
    return apiClient.get('/portfolio/summary')
  }

  async getPortfolioHistory(from, to, interval = '1h') {
    return apiClient.get('/portfolio/history', { from, to, interval })
  }

  async getAllocation() {
    return apiClient.get('/portfolio/allocation')
  }
}

export const walletService = new WalletService()
