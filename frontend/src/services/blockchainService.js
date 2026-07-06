import { apiClient } from './api'

class BlockchainService {
  async getStatus() {
    return apiClient.get('/blockchain/status')
  }

  async linkWallet(walletAddress) {
    return apiClient.post('/blockchain/link-wallet', { wallet_address: walletAddress })
  }

  async getLinkedWallet() {
    return apiClient.get('/blockchain/wallet')
  }

  async settleTrade(tradeId) {
    return apiClient.post('/blockchain/settle', { trade_id: tradeId })
  }

  async verifyTrade(tradeId) {
    return apiClient.get(`/blockchain/verify/${tradeId}`)
  }

  async getSettlementCount() {
    return apiClient.get('/blockchain/settlements/count')
  }

  async getTokenBalance(address) {
    return apiClient.get(`/blockchain/token/balance/${address}`)
  }

  async claimFaucet() {
    return apiClient.post('/blockchain/token/faucet')
  }
}

export const blockchainService = new BlockchainService()
