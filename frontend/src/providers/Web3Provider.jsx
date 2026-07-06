'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const Web3Context = createContext(null)

export function useWeb3() {
  return useContext(Web3Context)
}

const SEPOLIA_CHAIN_ID = '0xaa36a7' // 11155111

export function Web3Provider({ children }) {
  const [account, setAccount] = useState(null)
  const [chainId, setChainId] = useState(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState(null)

  const isMetaMask = typeof window !== 'undefined' && !!window.ethereum

  useEffect(() => {
    if (!isMetaMask) return
    window.ethereum.request({ method: 'eth_accounts' }).then((accounts) => {
      if (accounts.length > 0) setAccount(accounts[0])
    }).catch(() => {})
    window.ethereum.request({ method: 'eth_chainId' }).then(setChainId).catch(() => {})

    const handleAccountsChanged = (accounts) => setAccount(accounts[0] || null)
    const handleChainChanged = (id) => { setChainId(id); window.location.reload() }

    window.ethereum.on('accountsChanged', handleAccountsChanged)
    window.ethereum.on('chainChanged', handleChainChanged)
    return () => {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged)
      window.ethereum.removeListener('chainChanged', handleChainChanged)
    }
  }, [isMetaMask])

  const connect = useCallback(async () => {
    if (!isMetaMask) {
      setError('Please install MetaMask to connect your wallet')
      return null
    }
    setConnecting(true)
    setError(null)
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      const addr = accounts[0]
      setAccount(addr)

      const currentChain = await window.ethereum.request({ method: 'eth_chainId' })
      setChainId(currentChain)

      if (currentChain !== SEPOLIA_CHAIN_ID) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: SEPOLIA_CHAIN_ID }],
          })
        } catch (switchError) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: SEPOLIA_CHAIN_ID,
                chainName: 'Sepolia Testnet',
                nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
                rpcUrls: ['https://rpc.sepolia.org'],
                blockExplorerUrls: ['https://sepolia.etherscan.io'],
              }],
            })
          }
        }
      }
      return addr
    } catch (err) {
      setError(err.message || 'Failed to connect wallet')
      return null
    } finally {
      setConnecting(false)
    }
  }, [isMetaMask])

  const disconnect = useCallback(() => {
    setAccount(null)
    setChainId(null)
  }, [])

  const shortAddress = account ? `${account.slice(0, 6)}...${account.slice(-4)}` : null
  const isSepoliaNetwork = chainId === SEPOLIA_CHAIN_ID

  return (
    <Web3Context.Provider value={{
      account, chainId, connecting, error, isMetaMask,
      shortAddress, isSepoliaNetwork,
      connect, disconnect,
    }}>
      {children}
    </Web3Context.Provider>
  )
}
