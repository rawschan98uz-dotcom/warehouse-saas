export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      organization_users: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          role: 'admin' | 'manager' | 'staff'
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          role: 'admin' | 'manager' | 'staff'
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          user_id?: string
          role?: 'admin' | 'manager' | 'staff'
          created_at?: string
        }
      }
      categories: {
        Row: {
          id: string
          organization_id: string
          name: string
          description: string | null
          parent_id: string | null
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          description?: string | null
          parent_id?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          description?: string | null
          parent_id?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
      }
      locations: {
        Row: {
          id: string
          organization_id: string
          name: string
          type: 'warehouse' | 'store'
          address: string | null
          manager_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          type: 'warehouse' | 'store'
          address?: string | null
          manager_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          type?: 'warehouse' | 'store'
          address?: string | null
          manager_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      suppliers: {
        Row: {
          id: string
          organization_id: string
          name: string
          contact_person: string | null
          email: string | null
          phone: string | null
          address: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          contact_person?: string | null
          email?: string | null
          phone?: string | null
          address?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          contact_person?: string | null
          email?: string | null
          phone?: string | null
          address?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      products: {
        Row: {
          id: string
          organization_id: string
          category_id: string | null
          sku: string
          name: string
          description: string | null
          unit: string
          purchase_price: number
          sale_price: number
          currency: string
          min_stock_level: number
          brand: string | null
          color: string | null
          size: string | null
          barcode: string | null
          is_active: boolean
          image_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          category_id?: string | null
          sku: string
          name: string
          description?: string | null
          unit?: string
          purchase_price?: number
          sale_price?: number
          currency?: string
          min_stock_level?: number
          brand?: string | null
          color?: string | null
          size?: string | null
          barcode?: string | null
          is_active?: boolean
          image_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          category_id?: string | null
          sku?: string
          name?: string
          description?: string | null
          unit?: string
          purchase_price?: number
          sale_price?: number
          currency?: string
          min_stock_level?: number
          brand?: string | null
          color?: string | null
          size?: string | null
          barcode?: string | null
          is_active?: boolean
          image_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      inventory: {
        Row: {
          id: string
          organization_id: string
          product_id: string
          location_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          product_id: string
          location_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          product_id?: string
          location_id?: string
          quantity?: number
          updated_at?: string
        }
      }
      transactions: {
        Row: {
          id: string
          organization_id: string
          type: 'arrival' | 'sale' | 'transfer' | 'expense' | 'purchase'
          from_location_id: string | null
          to_location_id: string | null
          supplier_id: string | null
          user_id: string
          customer_id: string | null
          total_amount: number
          metadata: Json
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          type: 'arrival' | 'sale' | 'transfer' | 'expense' | 'purchase'
          from_location_id?: string | null
          to_location_id?: string | null
          supplier_id?: string | null
          user_id: string
          customer_id?: string | null
          total_amount?: number
          metadata?: Json
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          type?: 'arrival' | 'sale' | 'transfer' | 'expense' | 'purchase'
          from_location_id?: string | null
          to_location_id?: string | null
          supplier_id?: string | null
          user_id?: string
          customer_id?: string | null
          total_amount?: number
          metadata?: Json
          notes?: string | null
          created_at?: string
        }
      }
      transaction_items: {
        Row: {
          id: string
          transaction_id: string
          product_id: string
          quantity: number
          price: number
          currency: string
          total: number
          created_at: string
        }
        Insert: {
          id?: string
          transaction_id: string
          product_id: string
          quantity: number
          price: number
          currency?: string
          total: number
          created_at?: string
        }
        Update: {
          id?: string
          transaction_id?: string
          product_id?: string
          quantity?: number
          price?: number
          currency?: string
          total?: number
          created_at?: string
        }
      }
      product_imports: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          filename: string
          total_rows: number
          success_count: number
          error_count: number
          status: 'processing' | 'completed' | 'failed'
          errors: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          filename: string
          total_rows?: number
          success_count?: number
          error_count?: number
          status: 'processing' | 'completed' | 'failed'
          errors?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          user_id?: string
          filename?: string
          total_rows?: number
          success_count?: number
          error_count?: number
          status?: 'processing' | 'completed' | 'failed'
          errors?: Json | null
          created_at?: string
        }
      }
      customers: {
        Row: {
          id: string
          organization_id: string
          full_name: string
          phone: string | null
          email: string | null
          birthday: string | null
          gender: 'male' | 'female' | 'other' | null
          source: string | null
          tags: string[]
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          full_name: string
          phone?: string | null
          email?: string | null
          birthday?: string | null
          gender?: 'male' | 'female' | 'other' | null
          source?: string | null
          tags?: string[]
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          full_name?: string
          phone?: string | null
          email?: string | null
          birthday?: string | null
          gender?: 'male' | 'female' | 'other' | null
          source?: string | null
          tags?: string[]
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      payment_methods: {
        Row: {
          id: string
          organization_id: string
          code: string
          name: string
          type: 'cash' | 'card' | 'bank_transfer' | 'digital_wallet' | 'other'
          is_active: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          code: string
          name: string
          type?: 'cash' | 'card' | 'bank_transfer' | 'digital_wallet' | 'other'
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          code?: string
          name?: string
          type?: 'cash' | 'card' | 'bank_transfer' | 'digital_wallet' | 'other'
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
      }
      sale_payments: {
        Row: {
          id: string
          organization_id: string
          transaction_id: string
          payment_method_id: string
          amount: number
          currency: string
          paid_at: string
          user_id: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          transaction_id: string
          payment_method_id: string
          amount: number
          currency?: string
          paid_at?: string
          user_id?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          transaction_id?: string
          payment_method_id?: string
          amount?: number
          currency?: string
          paid_at?: string
          user_id?: string | null
          notes?: string | null
          created_at?: string
        }
      }
      customer_debts: {
        Row: {
          id: string
          organization_id: string
          customer_id: string
          transaction_id: string | null
          original_amount: number
          paid_amount: number
          outstanding_amount: number
          status: 'open' | 'partially_paid' | 'closed' | 'cancelled'
          due_date: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          customer_id: string
          transaction_id?: string | null
          original_amount: number
          paid_amount?: number
          status?: 'open' | 'partially_paid' | 'closed' | 'cancelled'
          due_date?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          customer_id?: string
          transaction_id?: string | null
          original_amount?: number
          paid_amount?: number
          status?: 'open' | 'partially_paid' | 'closed' | 'cancelled'
          due_date?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      debt_payments: {
        Row: {
          id: string
          organization_id: string
          debt_id: string
          payment_method_id: string
          amount: number
          currency: string
          paid_at: string
          user_id: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          debt_id: string
          payment_method_id: string
          amount: number
          currency?: string
          paid_at?: string
          user_id?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          debt_id?: string
          payment_method_id?: string
          amount?: number
          currency?: string
          paid_at?: string
          user_id?: string | null
          notes?: string | null
          created_at?: string
        }
      }
      integration_requests: {
        Row: {
          id: string
          organization_id: string
          endpoint: string
          idempotency_key: string
          request_body: Json
          response_body: Json
          status_code: number
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          endpoint: string
          idempotency_key: string
          request_body?: Json
          response_body?: Json
          status_code?: number
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          endpoint?: string
          idempotency_key?: string
          request_body?: Json
          response_body?: Json
          status_code?: number
          created_at?: string
        }
      }
      inventory_sessions: {
        Row: {
          id: string
          organization_id: string
          location_id: string
          user_id: string
          status: 'draft' | 'in_progress' | 'completed' | 'cancelled'
          notes: string | null
          started_at: string
          completed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          location_id: string
          user_id: string
          status: 'draft' | 'in_progress' | 'completed' | 'cancelled'
          notes?: string | null
          started_at?: string
          completed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          location_id?: string
          user_id?: string
          status?: 'draft' | 'in_progress' | 'completed' | 'cancelled'
          notes?: string | null
          started_at?: string
          completed_at?: string | null
          created_at?: string
        }
      }
      inventory_items: {
        Row: {
          id: string
          session_id: string
          product_id: string
          expected_quantity: number
          actual_quantity: number | null
          difference: number | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          session_id: string
          product_id: string
          expected_quantity?: number
          actual_quantity?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          product_id?: string
          expected_quantity?: number
          actual_quantity?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}
