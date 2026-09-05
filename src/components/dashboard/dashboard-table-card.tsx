"use client"

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  RotateCw,
  Search,
  Users,
  UserPlus,
  ChevronRight,
  Phone,
  Building2,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { createClient } from '@/lib/supabase/client'

interface ContactItem {
  id: string
  name: string | null
  phone: string
  email?: string | null
  company?: string | null
  created_at: string
  updated_at?: string
}

export function DashboardTableCard() {
  const [contacts, setContacts] = useState<ContactItem[]>([])
  const [totalCount, setTotalCount] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)

  const loadContacts = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, count, error } = await supabase
        .from('contacts')
        .select('id, name, phone, email, company, created_at, updated_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(5)

      if (!error && data) {
        setContacts(data as ContactItem[])
        setTotalCount(count ?? data.length)
      }
    } catch (err) {
      console.error('Failed to load contacts for dashboard:', err)
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadContacts()
  }, [loadContacts])

  const handleRefresh = () => {
    setIsRefreshing(true)
    void loadContacts()
  }

  const filtered = contacts.filter((c) => {
    const name = c.name?.toLowerCase() ?? ''
    const phone = c.phone.toLowerCase()
    const comp = c.company?.toLowerCase() ?? ''
    const term = searchTerm.toLowerCase()
    return name.includes(term) || phone.includes(term) || comp.includes(term)
  })

  return (
    <div className="flex h-full flex-col justify-between rounded-lg border border-[#E5EAE7] bg-white p-4.5 shadow-xs transition-all duration-200 hover:shadow-sm">
      <div>
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Active Leads & Contacts
            </p>
            <div className="mt-1 flex items-baseline gap-2.5">
              <span className="text-[26px] font-extrabold tracking-tight text-slate-900 tabular-nums">
                {loading ? '—' : totalCount.toLocaleString()}
              </span>
              {!loading && totalCount > 0 && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                  <span>Live</span>
                </span>
              )}
            </div>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 border border-emerald-100/80 text-emerald-700">
            <Users className="h-4 w-4" />
          </div>
        </div>

        {/* Action bar: Search + Refresh */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search leads, phone, company..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-8 pl-8 pr-3 text-xs rounded-lg bg-[#F4F7F5] border border-[#E4E9E6] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-600 transition-all"
            />
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#E4E9E6] bg-white text-xs font-semibold text-slate-700 hover:bg-[#F4F7F5] hover:text-slate-900 transition-colors shadow-2xs disabled:opacity-60"
          >
            <RotateCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Table / Content */}
        <div className="mt-4">
          {loading ? (
            <div className="space-y-2 py-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between py-2 animate-pulse">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-slate-200" />
                    <div className="space-y-1">
                      <div className="h-3 w-28 rounded bg-slate-200" />
                      <div className="h-2.5 w-20 rounded bg-slate-100" />
                    </div>
                  </div>
                  <div className="h-4 w-16 rounded bg-slate-100" />
                </div>
              ))}
            </div>
          ) : contacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 border border-emerald-100/80 text-emerald-700">
                <UserPlus className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-900">No leads or contacts yet</p>
              <p className="mt-1 max-w-xs text-xs text-slate-500">
                Contacts will appear here once created, imported, or initiated via WhatsApp.
              </p>
              <Link
                href="/contacts"
                className="mt-3.5 inline-flex items-center gap-1.5 rounded-lg bg-[#0F332A] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#164237] transition-colors"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>Add Contact</span>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="pb-2 font-medium">Contact</th>
                    <th className="pb-2 font-medium">Company</th>
                    <th className="pb-2 font-medium text-right">Added</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map((item) => {
                    const displayName = item.name?.trim() || 'Unnamed Contact'
                    const initial = displayName.charAt(0).toUpperCase()
                    const createdDate = new Date(item.created_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })

                    return (
                      <tr key={item.id} className="group hover:bg-[#F4F7F5]/60 transition-colors">
                        <td className="py-2.5">
                          <Link href={`/contacts`} className="flex items-center gap-2.5 group-hover:opacity-90">
                            <Avatar className="size-7 rounded-lg ring-1 ring-[#E4E9E6]">
                              <AvatarFallback className="bg-emerald-50 text-[10px] font-bold text-emerald-800 rounded-lg">
                                {initial}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col min-w-0">
                              <span className="font-semibold text-slate-900 truncate group-hover:text-emerald-800">
                                {displayName}
                              </span>
                              <span className="text-[10px] text-slate-500 truncate flex items-center gap-1">
                                <Phone className="h-2.5 w-2.5 shrink-0" />
                                {item.phone}
                              </span>
                            </div>
                          </Link>
                        </td>

                        <td className="py-2.5">
                          {item.company ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 border border-slate-200/60 px-2 py-0.5 text-[10px] font-medium text-slate-700 truncate max-w-[120px]">
                              <Building2 className="h-2.5 w-2.5 shrink-0" />
                              {item.company}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </td>

                        <td className="py-2.5 text-right tabular-nums text-slate-600 text-[11px]">
                          {createdDate}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Footer link to full inbox/contacts */}
      <div className="mt-4 border-t border-slate-100 pt-3 text-right">
        <Link
          href="/contacts"
          className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:text-emerald-950"
        >
          <span>View all contacts</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}

