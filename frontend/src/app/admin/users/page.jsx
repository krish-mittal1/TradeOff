'use client'

import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Users } from 'lucide-react'
import { ProductShell, EmptyState, StatusPill } from '@/components/ProductShell'
import { apiClient } from '@/services/api'

export default function AdminUsersPage() {
  const { data, error, refetch } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => apiClient.get('/admin/users'),
    retry: 1,
  })
  const users = data?.users || []

  async function suspend(userId) {
    try {
      await apiClient.post(`/admin/users/${userId}/suspend`)
      toast.success('User suspended')
      refetch()
    } catch (err) {
      toast.error(err.message || 'Could not suspend user')
    }
  }

  async function activate(userId) {
    try {
      await apiClient.post(`/admin/users/${userId}/activate`)
      toast.success('User activated')
      refetch()
    } catch (err) {
      toast.error(err.message || 'Could not activate user')
    }
  }

  return (
    <ProductShell title="User Management" subtitle="View, suspend, and activate user accounts.">
      <div className="panel overflow-hidden">
        <div className="panel-title">
          <span className="flex items-center gap-2">
            <Users size={15} /> Users
          </span>
          <StatusPill>{users.length} total</StatusPill>
        </div>
        <div className="grid grid-cols-5 border-b border-white/5 px-4 py-3 text-xs uppercase tracking-wider text-slate-600">
          <span>Email</span>
          <span>Status</span>
          <span>KYC</span>
          <span>MFA</span>
          <span>Actions</span>
        </div>
        {error ? (
          <EmptyState>Admin role required to view this page.</EmptyState>
        ) : users.length ? (
          users.map((user) => (
            <div
              key={user.id}
              className="grid grid-cols-5 items-center border-b border-white/5 px-4 py-3 text-sm"
            >
              <span className="truncate text-white">{user.email}</span>
              <StatusPill tone={user.status === 'ACTIVE' ? 'success' : 'warning'}>
                {user.status}
              </StatusPill>
              <span>Level {user.kyc_level}</span>
              <span className={user.mfa_enabled ? 'text-emerald-400' : 'text-slate-500'}>
                {user.mfa_enabled ? 'On' : 'Off'}
              </span>
              <span className="flex gap-2">
                {user.status !== 'SUSPENDED' ? (
                  <button
                    onClick={() => suspend(user.id)}
                    className="rounded bg-rose-500/10 px-2 py-1 text-xs text-rose-400 hover:bg-rose-500/20"
                  >
                    Suspend
                  </button>
                ) : (
                  <button
                    onClick={() => activate(user.id)}
                    className="rounded bg-emerald-500/10 px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-500/20"
                  >
                    Activate
                  </button>
                )}
              </span>
            </div>
          ))
        ) : (
          <EmptyState>No users found.</EmptyState>
        )}
      </div>
    </ProductShell>
  )
}
