'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ensureOrganizationId } from '@/lib/org/organization'

interface AuthContextType {
  user: User | null
  loading: boolean
  organizationId: string | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    let isMounted = true

    const setSafeLoading = (value: boolean) => {
      if (isMounted) {
        setLoading(value)
      }
    }

    const setSafeUser = (value: User | null) => {
      if (isMounted) {
        setUser(value)
      }
    }

    const setSafeOrganizationId = (value: string | null) => {
      if (isMounted) {
        setOrganizationId(value)
      }
    }

    const loadOrganizationId = async (userId: string) => {
      try {
        const orgId = await ensureOrganizationId(supabase, userId)
        setSafeOrganizationId(orgId)
      } catch (error) {
        console.error('Failed to load organization for user:', error)
        setSafeOrganizationId(null)
      }
    }

    const getUser = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        setSafeUser(user)
        setSafeLoading(false)

        if (user) {
          void loadOrganizationId(user.id)
        } else {
          setSafeOrganizationId(null)
        }
      } catch (error) {
        console.error('Failed to load current auth user:', error)
        setSafeUser(null)
        setSafeOrganizationId(null)
        setSafeLoading(false)
      }
    }

    const loadingTimeout = setTimeout(() => {
      setSafeLoading(false)
    }, 8000)

    getUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSafeUser(session?.user ?? null)
      setSafeLoading(false)

      if (session?.user) {
        void loadOrganizationId(session.user.id)
      } else {
        setSafeOrganizationId(null)
      }
    })

    return () => {
      isMounted = false
      clearTimeout(loadingTimeout)
      subscription.unsubscribe()
    }
  }, [supabase])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
    router.push('/dashboard')
  }

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    })
    if (error) throw error
    void data
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    router.push('/login')
  }

  return (
    <AuthContext.Provider value={{ user, loading, organizationId, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
