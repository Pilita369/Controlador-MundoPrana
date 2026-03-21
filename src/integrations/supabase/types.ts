export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      ajustes_usuario: {
        Row: {
          created_at: string
          datos_iniciales_cargados: boolean
          id: string
          meta_sueldo_mensual: number
          nombre_negocio: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          datos_iniciales_cargados?: boolean
          id?: string
          meta_sueldo_mensual?: number
          nombre_negocio?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          datos_iniciales_cargados?: boolean
          id?: string
          meta_sueldo_mensual?: number
          nombre_negocio?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      categorias_gasto: {
        Row: {
          created_at: string
          id: string
          nombre: string
          tipo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nombre: string
          tipo: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
          tipo?: string
          user_id?: string
        }
        Relationships: []
      }
      gastos: {
        Row: {
          categoria_id: string | null
          created_at: string
          descripcion: string
          fecha: string
          id: string
          medio_pago: string
          monto: number
          notas: string | null
          tipo: string
          user_id: string
        }
        Insert: {
          categoria_id?: string | null
          created_at?: string
          descripcion: string
          fecha?: string
          id?: string
          medio_pago: string
          monto: number
          notas?: string | null
          tipo: string
          user_id: string
        }
        Update: {
          categoria_id?: string | null
          created_at?: string
          descripcion?: string
          fecha?: string
          id?: string
          medio_pago?: string
          monto?: number
          notas?: string | null
          tipo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gastos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_gasto"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          activo: boolean
          alerta_stock_bajo: number
          created_at: string
          id: string
          nombre: string
          porcentaje_ganancia: number | null
          precio_costo: number
          precio_venta: number
          precio_venta_manual: boolean
          stock_actual: number
          tipo: string
          unidad_medida: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activo?: boolean
          alerta_stock_bajo?: number
          created_at?: string
          id?: string
          nombre: string
          porcentaje_ganancia?: number | null
          precio_costo?: number
          precio_venta?: number
          precio_venta_manual?: boolean
          stock_actual?: number
          tipo: string
          unidad_medida?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activo?: boolean
          alerta_stock_bajo?: number
          created_at?: string
          id?: string
          nombre?: string
          porcentaje_ganancia?: number | null
          precio_costo?: number
          precio_venta?: number
          precio_venta_manual?: boolean
          stock_actual?: number
          tipo?: string
          unidad_medida?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stock_movimientos: {
        Row: {
          cantidad: number
          created_at: string
          id: string
          notas: string | null
          producto_id: string
          tipo: string
          user_id: string
        }
        Insert: {
          cantidad: number
          created_at?: string
          id?: string
          notas?: string | null
          producto_id: string
          tipo: string
          user_id: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          id?: string
          notas?: string | null
          producto_id?: string
          tipo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movimientos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      sueldo_retiros: {
        Row: {
          cantidad_producto: number | null
          created_at: string
          fecha: string
          id: string
          medio_pago: string | null
          monto: number
          notas: string | null
          producto_id: string | null
          tipo: string
          user_id: string
        }
        Insert: {
          cantidad_producto?: number | null
          created_at?: string
          fecha?: string
          id?: string
          medio_pago?: string | null
          monto: number
          notas?: string | null
          producto_id?: string | null
          tipo: string
          user_id: string
        }
        Update: {
          cantidad_producto?: number | null
          created_at?: string
          fecha?: string
          id?: string
          medio_pago?: string | null
          monto?: number
          notas?: string | null
          producto_id?: string | null
          tipo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sueldo_retiros_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas: {
        Row: {
          cantidad: number
          created_at: string
          fecha: string
          id: string
          medio_cobro: string
          precio_unitario: number
          producto_id: string
          total: number
          user_id: string
        }
        Insert: {
          cantidad: number
          created_at?: string
          fecha?: string
          id?: string
          medio_cobro: string
          precio_unitario: number
          producto_id: string
          total: number
          user_id: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          fecha?: string
          id?: string
          medio_cobro?: string
          precio_unitario?: number
          producto_id?: string
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ventas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
