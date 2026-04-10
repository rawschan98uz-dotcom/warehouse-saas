'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/auth-context'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Moon, Sun } from 'lucide-react'

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [fullName, setFullName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [currency, setCurrency] = useState('UZS')
  const [darkMode, setDarkMode] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) router.push('/login')
  }, [user, authLoading, router])

  useEffect(() => {
    if (user) {
      fetchSettings()
      const isDark = document.documentElement.classList.contains('dark')
      setDarkMode(isDark)
    }
  }, [user])

  const fetchSettings = async () => {
    try {
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user?.id).single()
      if (profile?.full_name) setFullName(profile.full_name)

      const { data: orgUser } = await supabase.from('organization_users').select('organization_id').eq('user_id', user?.id).single()
      if (orgUser) {
        const { data: org } = await supabase.from('organizations').select('name, currency').eq('id', orgUser.organization_id).single()
        if (org) {
          setOrgName(org.name)
          setCurrency(org.currency)
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    setError('')
    setSuccess('')
    setSaving(true)

    try {
      await supabase.from('profiles').update({ full_name: fullName }).eq('id', user?.id)

      const { data: orgUser } = await supabase.from('organization_users').select('organization_id').eq('user_id', user?.id).single()
      if (orgUser) {
        await supabase.from('organizations').update({ name: orgName, currency }).eq('id', orgUser.organization_id)
      }

      setSuccess('Настройки сохранены')
    } catch (err: any) {
      setError(err.message || 'Ошибка')
    } finally {
      setSaving(false)
    }
  }

  const toggleDarkMode = () => {
    const newDarkMode = !darkMode
    setDarkMode(newDarkMode)
    if (newDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  if (authLoading || loading) return <div className="flex items-center justify-center min-h-screen"><div className="text-lg">Загрузка...</div></div>
  if (!user) return null

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Настройки</h1>
        <p className="mt-2 text-muted-foreground">Профиль и параметры системы</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Профиль</CardTitle>
          <CardDescription>Информация о пользователе</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Имя</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ваше имя" />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user.email || ''} disabled />
          </div>
          <Button onClick={handleSaveProfile} disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Организация</CardTitle>
          <CardDescription>Настройки организации</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Название организации</Label>
            <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Моя организация" />
          </div>
          <div className="space-y-2">
            <Label>Валюта по умолчанию</Label>
            <Select value={currency} onValueChange={(value) => setCurrency(value || 'UZS')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="UZS">UZS (Узбекский сум)</SelectItem>
                <SelectItem value="USD">USD (Доллар США)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleSaveProfile} disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Внешний вид</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Тёмная тема</p>
              <p className="text-sm text-muted-foreground">Переключение между светлой и тёмной темой</p>
            </div>
            <Button variant="outline" size="icon" onClick={toggleDarkMode}>
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {success && <div className="text-sm text-[#27AE60] bg-green-50 p-3 rounded">{success}</div>}
      {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}
    </div>
  )
}
