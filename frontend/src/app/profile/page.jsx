'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ProductShell, StatCard } from '@/components/ProductShell'
import { apiClient } from '@/services/api'
import { authService } from '@/services/authService'

export default function ProfilePage() {
  const [displayName, setDisplayName] = useState('')
  const [totp, setTotp] = useState('')
  const [secret, setSecret] = useState('')
  const [apiSecret, setApiSecret] = useState(null)
  
  const [maxOpenOrders, setMaxOpenOrders] = useState('')
  const [dailyWithdrawalLimit, setDailyWithdrawalLimit] = useState('')

  const meQuery = useQuery({ queryKey: ['me'], queryFn: () => apiClient.get('/users/me'), retry: 1 })
  const riskQuery = useQuery({ queryKey: ['risk-limits'], queryFn: () => apiClient.get('/risk/limits'), retry: 1 })
  const apiKeysQuery = useQuery({ queryKey: ['api-keys'], queryFn: () => apiClient.get('/users/api-keys'), retry: 1 })
  const referralsQuery = useQuery({ queryKey: ['referrals'], queryFn: () => apiClient.get('/users/referrals'), retry: 1 })
  const me = meQuery.data

  useEffect(() => {
    if (riskQuery.data) {
      setMaxOpenOrders(String(riskQuery.data.max_open_orders || ''))
      setDailyWithdrawalLimit(String(riskQuery.data.daily_withdrawal_limit || ''))
    }
  }, [riskQuery.data])

  async function saveRiskLimits() {
    try {
      await apiClient.put('/risk/limits', {
        max_open_orders: maxOpenOrders ? Number(maxOpenOrders) : null,
        daily_withdrawal_limit: dailyWithdrawalLimit ? Number(dailyWithdrawalLimit) : null,
      })
      toast.success('Risk limits updated')
      riskQuery.refetch()
    } catch (error) {
      toast.error(error.message || 'Could not update risk limits')
    }
  }

  async function saveProfile() {
    try {
      await apiClient.patch('/users/me', { display_name: displayName || me?.display_name || 'Trader' })
      toast.success('Profile updated')
      meQuery.refetch()
    } catch (error) {
      toast.error(error.message || 'Could not update profile')
    }
  }

  async function setupMfa() {
    try {
      const result = await authService.setupMfa()
      setSecret(result.secret)
      toast.success('MFA secret generated')
    } catch (error) {
      toast.error(error.message || 'Could not setup MFA')
    }
  }

  async function verifyMfa() {
    try {
      await authService.verifyMfa(totp, secret)
      toast.success('MFA enabled')
      meQuery.refetch()
    } catch (error) {
      toast.error(error.message || 'Invalid MFA code')
    }
  }

  async function createApiKey() {
    try {
      const result = await apiClient.post('/users/api-keys', {
        name: 'Trading Bot',
        permissions: { read: true, trade: true, withdraw: false },
      })
      setApiSecret(result)
      toast.success('API key created')
      apiKeysQuery.refetch()
    } catch (error) {
      toast.error(error.message || 'Could not create API key')
    }
  }

  return <ProductShell title="Profile & Security" subtitle="Account settings, MFA, and personal risk controls.">
    <div className="grid gap-3 md:grid-cols-3">
      <StatCard label="Account" value={me?.status || 'Unknown'} detail={me?.email} />
      <StatCard label="KYC level" value={me?.kyc_level ?? '-'} detail="Simulator profile tier" />
      <StatCard label="MFA" value={me?.mfa_enabled ? 'Enabled' : 'Disabled'} detail="TOTP protection" />
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div className="panel p-5">
        <div className="panel-title -mx-5 -mt-5 mb-4">Profile</div>
        <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="auth-input" placeholder={me?.display_name || 'Display name'} />
        <button onClick={saveProfile} className="mt-3 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-black">Save profile</button>
      </div>
      <div className="panel p-5">
        <div className="panel-title -mx-5 -mt-5 mb-4">MFA</div>
        <button onClick={setupMfa} className="rounded-lg bg-white/5 px-4 py-2 text-sm text-amber-400">Generate TOTP secret</button>
        {secret && <div className="mt-3 rounded bg-white/[0.035] p-3 font-mono text-xs text-slate-300">{secret}</div>}
        <input value={totp} onChange={(event) => setTotp(event.target.value)} className="auth-input" placeholder="6-digit code" />
        <button onClick={verifyMfa} disabled={!secret || !totp} className="mt-3 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Verify MFA</button>
      </div>
    </div>
    <div className="panel mt-4 p-5">
      <div className="panel-title -mx-5 -mt-5 mb-4">Risk Limits</div>
      <div className="grid gap-4 md:grid-cols-3 text-sm items-end">
        <label className="auth-label">
          Max open orders
          <input 
            type="number" 
            value={maxOpenOrders} 
            onChange={(e) => setMaxOpenOrders(e.target.value)} 
            className="auth-input mt-1" 
            placeholder="100"
          />
        </label>
        <label className="auth-label">
          Daily withdrawal limit (USDT)
          <input 
            type="number" 
            value={dailyWithdrawalLimit} 
            onChange={(e) => setDailyWithdrawalLimit(e.target.value)} 
            className="auth-input mt-1" 
            placeholder="10000"
          />
        </label>
        <div className="mb-2">
          <div className="text-slate-600">Suspended</div>
          <div className="mt-1 font-semibold">
            <span className={riskQuery.data?.is_suspended ? 'text-rose-400' : 'text-emerald-400'}>
              {riskQuery.data?.is_suspended ? 'Yes' : 'No'}
            </span>
          </div>
        </div>
      </div>
      <button 
        onClick={saveRiskLimits} 
        className="mt-4 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-black"
      >
        Update Limits
      </button>
    </div>
    <div className="panel mt-4 p-5">
      <div className="panel-title -mx-5 -mt-5 mb-4">Referral Program</div>
      <div className="grid gap-3 md:grid-cols-3 text-sm">
        <div><div className="text-slate-600">My Referral Code</div><div className="mt-1 text-white font-mono font-semibold">{me?.referral_code || '-'}</div></div>
        <div><div className="text-slate-600">Total Referrals</div><div className="mt-1 text-white font-semibold">{referralsQuery.data?.referrals || 0}</div></div>
        <div><div className="text-slate-600">Accumulated Rewards</div><div className="mt-1 text-white font-semibold">${Number(referralsQuery.data?.rewards || 0).toLocaleString()} USDT</div></div>
      </div>
      <div className="mt-4 text-xs text-slate-500 font-light border-t border-white/5 pt-3">
        Share your referral code with friends. They will get set up on the TradeOff platform, and you will earn demo credits!
      </div>
    </div>
    <div className="panel mt-4 p-5">
      <div className="panel-title -mx-5 -mt-5 mb-4">API Keys</div>
      {apiSecret && <div className="mb-4 rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-200">
        <div>Key: <span className="font-mono">{apiSecret.key}</span></div>
        <div className="mt-1">Secret: <span className="font-mono">{apiSecret.secret}</span></div>
        <div className="mt-2 text-amber-300">{apiSecret.warning}</div>
      </div>}
      <button onClick={createApiKey} className="rounded-lg bg-white/5 px-4 py-2 text-sm text-amber-400">Create trading API key</button>
      <div className="mt-4 overflow-hidden rounded-lg border border-white/5">
        {(apiKeysQuery.data?.api_keys || []).map((key) => <div key={key.id} className="grid grid-cols-3 border-b border-white/5 px-3 py-2 text-xs"><span>{key.name}</span><span>{key.key_prefix}</span><span>{key.is_active ? 'Active' : 'Revoked'}</span></div>)}
      </div>
    </div>
  </ProductShell>
}
