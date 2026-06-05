'use client'

import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ProductShell, EmptyState } from '@/components/ProductShell'
import { apiClient } from '@/services/api'

export default function NotificationsPage() {
  const query = useQuery({ queryKey: ['notifications'], queryFn: () => apiClient.get('/notifications'), retry: 1 })
  const notifications = query.data?.notifications || []

  async function markRead(id) {
    try {
      await apiClient.post(`/notifications/${id}/read`)
      toast.success('Marked as read')
      query.refetch()
    } catch (error) {
      toast.error(error.message || 'Could not update notification')
    }
  }

  return <ProductShell title="Notifications" subtitle="Trade, wallet, risk, and system updates.">
    <div className="panel overflow-hidden">
      <div className="panel-title">Inbox</div>
      {notifications.length ? notifications.map((item) => <div key={item.id} className="grid grid-cols-[1fr_auto] gap-4 border-b border-white/5 px-4 py-4 text-sm">
        <div><div className="font-medium text-white">{item.title}</div><div className="mt-1 text-slate-500">{item.body}</div><div className="mt-2 text-[11px] text-slate-700">{item.type}</div></div>
        <button onClick={() => markRead(item.id)} className="rounded bg-white/5 px-3 py-1 text-xs text-amber-400">{item.is_read ? 'Read' : 'Mark read'}</button>
      </div>) : <EmptyState>No notifications yet.</EmptyState>}
    </div>
  </ProductShell>
}
