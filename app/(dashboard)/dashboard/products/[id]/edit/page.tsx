'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/auth-context'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function EditProductPage() {
  const router = useRouter()
  const params = useParams()
  const productId = params.id as string
  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()
  
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')
  const [locations, setLocations] = useState<any[]>([])
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    unit: 'шт',
    purchase_price: '',
    sale_price: '',
    currency: 'UZS',
    min_stock_level: '0',
  })

  useEffect(() => {
    if (!authLoading && !user) router.push('/login')
  }, [user, authLoading, router])

  useEffect(() => {
    if (user) {
      fetchProduct()
      fetchLocations()
    }
  }, [user, productId])

  const fetchProduct = async () => {
    const { data, error } = await supabase.from('products').select('*').eq('id', productId).single()
    if (data) {
      setFormData({
        name: data.name,
        description: data.description || '',
        unit: data.unit,
        purchase_price: data.purchase_price.toString(),
        sale_price: data.sale_price.toString(),
        currency: data.currency,
        min_stock_level: data.min_stock_level.toString(),
      })
    }
    setFetching(false)
  }

  const fetchLocations = async () => {
    const { data } = await supabase.from('locations').select('*').order('name')
    if (data) setLocations(data)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { error: updateError } = await supabase
        .from('products')
        .update({
          name: formData.name,
          description: formData.description || null,
          unit: formData.unit,
          purchase_price: parseFloat(formData.purchase_price),
          sale_price: parseFloat(formData.sale_price),
          currency: formData.currency,
          min_stock_level: parseInt(formData.min_stock_level),
        })
        .eq('id', productId)

      if (updateError) throw updateError
      router.push('/dashboard/products')
    } catch (err: any) {
      setError(err.message || 'Ошибка при обновлении товара')
    } finally {
      setLoading(false)
    }
  }

  if (authLoading || fetching) {
    return <div className="flex items-center justify-center min-h-screen"><div className="text-lg">Загрузка...</div></div>
  }

  if (!user) return null

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Редактировать товар</h1>
        <p className="mt-2 text-muted-foreground">Изменение информации о товаре</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Информация о товаре</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Название товара *</Label>
              <Input id="name" name="name" value={formData.name} onChange={handleChange} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unit">Единица измерения *</Label>
                <Input id="unit" name="unit" value={formData.unit} onChange={handleChange} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Валюта *</Label>
                <Select value={formData.currency} onValueChange={(v) => setFormData({ ...formData, currency: v || 'UZS' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UZS">UZS</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Описание</Label>
              <Textarea id="description" name="description" value={formData.description} onChange={handleChange} rows={3} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="purchase_price">Цена закупки *</Label>
                <Input id="purchase_price" name="purchase_price" type="number" step="0.01" min="0" value={formData.purchase_price} onChange={handleChange} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sale_price">Цена продажи *</Label>
                <Input id="sale_price" name="sale_price" type="number" step="0.01" min="0" value={formData.sale_price} onChange={handleChange} required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="min_stock_level">Минимальный остаток</Label>
              <Input id="min_stock_level" name="min_stock_level" type="number" min="0" value={formData.min_stock_level} onChange={handleChange} />
            </div>

            {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}

            <div className="flex gap-4">
              <Button type="submit" disabled={loading}>{loading ? 'Сохранение...' : 'Сохранить'}</Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>Отмена</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
