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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          entity: string
          entity_id: string | null
          group_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity: string
          entity_id?: string | null
          group_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity?: string
          entity_id?: string | null
          group_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_member_roles: {
        Row: {
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          member_id: string
          role: Database["public"]["Enums"]["group_role"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          member_id: string
          role: Database["public"]["Enums"]["group_role"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          member_id?: string
          role?: Database["public"]["Enums"]["group_role"]
        }
        Relationships: [
          {
            foreignKeyName: "group_member_roles_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_member_roles_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "group_members"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          created_at: string
          created_by: string | null
          full_name: string
          group_id: string
          id: string
          joined_at: string | null
          phone: string | null
          profession: string | null
          status: Database["public"]["Enums"]["member_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          full_name: string
          group_id: string
          id?: string
          joined_at?: string | null
          phone?: string | null
          profession?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          full_name?: string
          group_id?: string
          id?: string
          joined_at?: string | null
          phone?: string | null
          profession?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          location: string | null
          member_directory_visible: boolean
          name: string
          official_email: string | null
          official_phone: string | null
          status: Database["public"]["Enums"]["group_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          member_directory_visible?: boolean
          name: string
          official_email?: string | null
          official_phone?: string | null
          status?: Database["public"]["Enums"]["group_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          member_directory_visible?: boolean
          name?: string
          official_email?: string | null
          official_phone?: string | null
          status?: Database["public"]["Enums"]["group_status"]
          updated_at?: string
        }
        Relationships: []
      }
      member_private_data: {
        Row: {
          address: string | null
          birth_date: string | null
          created_at: string
          email: string
          group_id: string
          id_document_number: string | null
          id_document_type: string | null
          member_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          created_at?: string
          email: string
          group_id: string
          id_document_number?: string | null
          id_document_type?: string | null
          member_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          created_at?: string
          email?: string
          group_id?: string
          id_document_number?: string | null
          id_document_type?: string | null
          member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_private_data_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_private_data_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "group_members"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_role_invites: {
        Row: {
          created_at: string
          email: string
          role: Database["public"]["Enums"]["platform_role"]
        }
        Insert: {
          created_at?: string
          email: string
          role?: Database["public"]["Enums"]["platform_role"]
        }
        Update: {
          created_at?: string
          email?: string
          role?: Database["public"]["Enums"]["platform_role"]
        }
        Relationships: []
      }
      platform_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["platform_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["platform_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["platform_role"]
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _confirmed_user_id: { Args: { _email: string }; Returns: string }
      _link_user_invites: {
        Args: { _email: string; _uid: string }
        Returns: undefined
      }
      _valid_email: { Args: { _email: string }; Returns: boolean }
      accept_invitation: { Args: { _member_id: string }; Returns: undefined }
      add_group_member: {
        Args: {
          _address?: string
          _birth_date?: string
          _email: string
          _full_name: string
          _group_id: string
          _id_document_number?: string
          _id_document_type?: string
          _phone: string
          _profession: string
          _roles?: Database["public"]["Enums"]["group_role"][]
        }
        Returns: string
      }
      can_manage_members: {
        Args: { _group: string; _uid: string }
        Returns: boolean
      }
      create_group: {
        Args: {
          _director_email: string
          _director_name: string
          _director_phone: string
          _location: string
          _name: string
          _official_email: string
          _official_phone: string
        }
        Returns: string
      }
      group_directory_visible: { Args: { _group: string }; Returns: boolean }
      has_group_role: {
        Args: {
          _group: string
          _role: Database["public"]["Enums"]["group_role"]
          _uid: string
        }
        Returns: boolean
      }
      has_pending_invite: {
        Args: { _group: string; _uid: string }
        Returns: boolean
      }
      is_active_member: {
        Args: { _group: string; _uid: string }
        Returns: boolean
      }
      is_group_admin: {
        Args: { _group: string; _uid: string }
        Returns: boolean
      }
      is_own_member: {
        Args: { _member: string; _uid: string }
        Returns: boolean
      }
      is_platform_owner: { Args: { _uid: string }; Returns: boolean }
      set_member_roles: {
        Args: {
          _member_id: string
          _roles: Database["public"]["Enums"]["group_role"][]
        }
        Returns: undefined
      }
      set_member_status: {
        Args: {
          _member_id: string
          _status: Database["public"]["Enums"]["member_status"]
        }
        Returns: undefined
      }
      update_group_member: {
        Args: {
          _address: string
          _birth_date: string
          _full_name: string
          _id_document_number: string
          _id_document_type: string
          _member_id: string
          _phone: string
          _profession: string
        }
        Returns: undefined
      }
      update_group_settings: {
        Args: {
          _group_id: string
          _location: string
          _member_directory_visible: boolean
          _name: string
          _official_email: string
          _official_phone: string
        }
        Returns: undefined
      }
    }
    Enums: {
      group_role: "diretor" | "tesoureiro" | "secretario" | "membro"
      group_status: "ativo" | "suspenso"
      member_status: "convidado" | "ativo" | "suspenso" | "excluido"
      platform_role: "agroei_owner"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      group_role: ["diretor", "tesoureiro", "secretario", "membro"],
      group_status: ["ativo", "suspenso"],
      member_status: ["convidado", "ativo", "suspenso", "excluido"],
      platform_role: ["agroei_owner"],
    },
  },
} as const
