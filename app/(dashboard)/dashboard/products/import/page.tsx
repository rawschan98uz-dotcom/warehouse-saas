'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import * as XLSX from 'xlsx'
import { ArrowLeft, Upload, Download, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import Link from 'next/link'

interface ImportRow {
  sku: string
  name: string
  description?: string
  category?: string
  unit?: string
  purchase_price?: number
  sale_price?: number
  brand?: string
  color?: string
  size?: string
  barcode?: string
  min_stock_level?: number
}

interface ImportResult {
  row: number
  success: boolean
  error?: string
  data?: ImportRow
}

interface ProductInsertPayload {
  organization_id: string
  sku: string
  name: string
  description: string | null
  category_id: null
  unit: string
  purchase_price: number
  sale_price: number
  currency: string
  brand: string | null
  color: string | null
  size: string | null
  barcode: string | null
  min_stock_level: number
  is_active: boolean
}

export default function ProductImportPage() {
  const router = useRouter()
  const { user, organizationId } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<ImportResult[]>([])
  const supabase = createClient()

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setResults([])
    }
  }

  async function handleImport() {
    if (!file || !organizationId || !user) return

    setImporting(true)
    setResults([])

    try {
      // Читаем Excel файл
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data)
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[]

      const importResults: ImportResult[] = []
      let successCount = 0
      let errorCount = 0

      // Создаем запись об импорте
      const { data: importRecord } = await supabase
        .from('product_imports')
        .insert({
          organization_id: organizationId,
          user_id: user.id,
          filename: file.name,
          total_rows: jsonData.length,
          status: 'processing'
        })
        .select()
        .single()

      // Обрабатываем каждую строку
      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i]
        const rowNumber = i + 2 // +2 потому что строка 1 - заголовки, и индекс с 0

        try {
          // Валидация обязательных полей
          if (!row.sku || !row.name) {
            throw new Error('SKU и название обязательны')
          }

          // Подготовка данных
          const productData: ProductInsertPayload = {
            organization_id: organizationId,
            sku: String(row.sku).trim(),
            name: String(row.name).trim(),
            description: row.description || null,
            category_id: null,
            unit: row.unit || 'шт',
            purchase_price: parseFloat(row.purchase_price) || 0,
            sale_price: parseFloat(row.sale_price) || 0,
            currency: row.currency || 'UZS',
            brand: row.brand || null,
            color: row.color || null,
            size: row.size || null,
            barcode: row.barcode || null,
            min_stock_level: parseInt(row.min_stock_level) || 0,
            is_active: true
          }

          // Вставка товара
          const { error } = await supabase
            .from('products')
            .insert(productData)

          if (error) {
            throw error
          }

          importResults.push({
            row: rowNumber,
            success: true,
            data: row
          })
          successCount++

        } catch (error: any) {
          importResults.push({
            row: rowNumber,
            success: false,
            error: error.message || 'Неизвестная ошибка',
            data: row
          })
          errorCount++
        }
      }

      // Обновляем запись об импорте
      await supabase
        .from('product_imports')
        .update({
          success_count: successCount,
          error_count: errorCount,
          status: errorCount === 0 ? 'completed' : 'completed',
          errors: importResults.filter(r => !r.success)
        })
        .eq('id', importRecord?.id)

      setResults(importResults)

    } catch (error: any) {
      alert('Ошибка при импорте: ' + error.message)
    } finally {
      setImporting(false)
    }
  }

  function downloadTemplate() {
    const template = [
      {
        sku: 'PROD-001',
        name: 'Пример товара',
        description: 'Описание товара',
        category: 'Категория',
        unit: 'шт',
        purchase_price: 1000,
        sale_price: 1500,
        currency: 'UZS',
        brand: 'Бренд',
        color: 'Красный',
        size: 'M',
        barcode: '1234567890',
        min_stock_level: 10
      }
    ]

    const ws = XLSX.utils.json_to_sheet(template)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Товары')
    XLSX.writeFile(wb, 'template_products.xlsx')
  }

  const successCount = results.filter(r => r.success).length
  const errorCount = results.filter(r => !r.success).length

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/dashboard/products">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад к товарам
          </Button>
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-6">Массовая загрузка товаров</h1>

      <Card className="p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Инструкция</h2>
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
          <li>Скачайте шаблон Excel файла</li>
          <li>Заполните данные о товарах (обязательные поля: SKU, название)</li>
          <li>Загрузите заполненный файл</li>
          <li>Проверьте результаты импорта</li>
        </ol>

        <div className="mt-4">
          <Button onClick={downloadTemplate} variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Скачать шаблон Excel
          </Button>
        </div>
      </Card>

      <Card className="p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Загрузка файла</h2>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="file">Выберите Excel файл (.xlsx)</Label>
            <Input
              id="file"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              disabled={importing}
            />
          </div>

          {file && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <AlertCircle className="w-4 h-4" />
              <span>Выбран файл: {file.name}</span>
            </div>
          )}

          <Button
            onClick={handleImport}
            disabled={!file || importing}
            className="w-full"
          >
            <Upload className="w-4 h-4 mr-2" />
            {importing ? 'Импорт...' : 'Начать импорт'}
          </Button>
        </div>
      </Card>

      {results.length > 0 && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Результаты импорта</h2>
          
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{results.length}</div>
              <div className="text-sm text-gray-600">Всего строк</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{successCount}</div>
              <div className="text-sm text-gray-600">Успешно</div>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{errorCount}</div>
              <div className="text-sm text-gray-600">Ошибок</div>
            </div>
          </div>

          {errorCount > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold text-red-600 mb-2">Ошибки импорта:</h3>
              <div className="max-h-96 overflow-y-auto space-y-2">
                {results.filter(r => !r.success).map((result, idx) => (
                  <div key={idx} className="bg-red-50 p-3 rounded border border-red-200">
                    <div className="flex items-start gap-2">
                      <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="font-medium text-sm">Строка {result.row}</div>
                        <div className="text-sm text-gray-600">
                          SKU: {result.data?.sku}, Название: {result.data?.name}
                        </div>
                        <div className="text-sm text-red-600 mt-1">{result.error}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {successCount > 0 && (
            <div className="mt-4">
              <Button onClick={() => router.push('/dashboard/products')} className="w-full">
                <CheckCircle className="w-4 h-4 mr-2" />
                Перейти к товарам
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
