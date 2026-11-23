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
      admin_role_history: {
        Row: {
          action: string
          actor_id: string | null
          actor_label: string
          created_at: string
          group_id: string
          id: string
          member_id: string | null
          member_name: string
          role: Database["public"]["Enums"]["group_role"]
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_label: string
          created_at?: string
          group_id: string
          id?: string
          member_id?: string | null
          member_name: string
          role: Database["public"]["Enums"]["group_role"]
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_label?: string
          created_at?: string
          group_id?: string
          id?: string
          member_id?: string | null
          member_name?: string
          role?: Database["public"]["Enums"]["group_role"]
        }
        Relationships: [
          {
            foreignKeyName: "admin_role_history_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_role_history_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "group_members"
            referencedColumns: ["id"]
          },
        ]
      }
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
      collective_profiles: {
        Row: {
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          name: string
          relation_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          name: string
          relation_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          name?: string
          relation_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collective_profiles_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      deposits: {
        Row: {
          amount: number
          channel: Database["public"]["Enums"]["payment_channel"]
          collective_profile_id: string | null
          created_at: string
          deposit_date: string
          group_id: string
          id: string
          member_id: string | null
          notes: string | null
          payment_account_id: string | null
          receipt_path: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_member: string | null
          status: Database["public"]["Enums"]["deposit_status"]
          submitted_by: string
          submitted_by_member: string
          transaction_ref: string
        }
        Insert: {
          amount: number
          channel: Database["public"]["Enums"]["payment_channel"]
          collective_profile_id?: string | null
          created_at?: string
          deposit_date: string
          group_id: string
          id?: string
          member_id?: string | null
          notes?: string | null
          payment_account_id?: string | null
          receipt_path: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_member?: string | null
          status?: Database["public"]["Enums"]["deposit_status"]
          submitted_by: string
          submitted_by_member: string
          transaction_ref: string
        }
        Update: {
          amount?: number
          channel?: Database["public"]["Enums"]["payment_channel"]
          collective_profile_id?: string | null
          created_at?: string
          deposit_date?: string
          group_id?: string
          id?: string
          member_id?: string | null
          notes?: string | null
          payment_account_id?: string | null
          receipt_path?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_member?: string | null
          status?: Database["public"]["Enums"]["deposit_status"]
          submitted_by?: string
          submitted_by_member?: string
          transaction_ref?: string
        }
        Relationships: [
          {
            foreignKeyName: "deposits_collective_profile_id_fkey"
            columns: ["collective_profile_id"]
            isOneToOne: false
            referencedRelation: "collective_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposits_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposits_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "group_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposits_payment_account_id_fkey"
            columns: ["payment_account_id"]
            isOneToOne: false
            referencedRelation: "group_payment_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposits_reviewed_by_member_fkey"
            columns: ["reviewed_by_member"]
            isOneToOne: false
            referencedRelation: "group_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposits_submitted_by_member_fkey"
            columns: ["submitted_by_member"]
            isOneToOne: false
            referencedRelation: "group_members"
            referencedColumns: ["id"]
          },
        ]
      }
      group_events: {
        Row: {
          created_at: string
          group_id: string
          id: string
          kind: string
          member_id: string | null
          member_name: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          kind: string
          member_id?: string | null
          member_name: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          kind?: string
          member_id?: string | null
          member_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_events_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "group_members"
            referencedColumns: ["id"]
          },
        ]
      }
      group_loan_settings: {
        Row: {
          created_at: string
          group_id: string
          guarantee_required: boolean
          interest_method: string | null
          interest_rate: number | null
          updated_at: string
          updated_by: string | null
          vote_deadline_days: number | null
        }
        Insert: {
          created_at?: string
          group_id: string
          guarantee_required?: boolean
          interest_method?: string | null
          interest_rate?: number | null
          updated_at?: string
          updated_by?: string | null
          vote_deadline_days?: number | null
        }
        Update: {
          created_at?: string
          group_id?: string
          guarantee_required?: boolean
          interest_method?: string | null
          interest_rate?: number | null
          updated_at?: string
          updated_by?: string | null
          vote_deadline_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "group_loan_settings_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: true
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
          collective_profile_id: string | null
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
          collective_profile_id?: string | null
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
          collective_profile_id?: string | null
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
            foreignKeyName: "group_members_collective_profile_id_fkey"
            columns: ["collective_profile_id"]
            isOneToOne: false
            referencedRelation: "collective_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_payment_accounts: {
        Row: {
          account_number: string
          active: boolean
          channel: Database["public"]["Enums"]["payment_channel"]
          created_at: string
          created_by: string | null
          group_id: string
          holder_name: string
          id: string
          institution: string | null
          updated_at: string
        }
        Insert: {
          account_number: string
          active?: boolean
          channel: Database["public"]["Enums"]["payment_channel"]
          created_at?: string
          created_by?: string | null
          group_id: string
          holder_name: string
          id?: string
          institution?: string | null
          updated_at?: string
        }
        Update: {
          account_number?: string
          active?: boolean
          channel?: Database["public"]["Enums"]["payment_channel"]
          created_at?: string
          created_by?: string | null
          group_id?: string
          holder_name?: string
          id?: string
          institution?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_payment_accounts_group_id_fkey"
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
      loan_votes: {
        Row: {
          created_at: string
          group_id: string
          id: string
          loan_id: string
          reason: string | null
          vote: Database["public"]["Enums"]["vote_choice"]
          voter_member_id: string
          voter_user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          loan_id: string
          reason?: string | null
          vote: Database["public"]["Enums"]["vote_choice"]
          voter_member_id: string
          voter_user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          loan_id?: string
          reason?: string | null
          vote?: Database["public"]["Enums"]["vote_choice"]
          voter_member_id?: string
          voter_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_votes_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_votes_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_votes_voter_member_id_fkey"
            columns: ["voter_member_id"]
            isOneToOne: false
            referencedRelation: "group_members"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          amount: number
          cancel_reason: string | null
          created_at: string
          decided_at: string | null
          declaration_path: string
          group_id: string
          guarantee_description: string | null
          guarantee_path: string | null
          id: string
          interest_method: string | null
          interest_rate: number | null
          member_id: string
          purpose: string
          rejection_reason: string | null
          requested_by: string
          status: Database["public"]["Enums"]["loan_status"]
          term_months: number
          updated_at: string
        }
        Insert: {
          amount: number
          cancel_reason?: string | null
          created_at?: string
          decided_at?: string | null
          declaration_path: string
          group_id: string
          guarantee_description?: string | null
          guarantee_path?: string | null
          id?: string
          interest_method?: string | null
          interest_rate?: number | null
          member_id: string
          purpose: string
          rejection_reason?: string | null
          requested_by: string
          status?: Database["public"]["Enums"]["loan_status"]
          term_months: number
          updated_at?: string
        }
        Update: {
          amount?: number
          cancel_reason?: string | null
          created_at?: string
          decided_at?: string | null
          declaration_path?: string
          group_id?: string
          guarantee_description?: string | null
          guarantee_path?: string | null
          id?: string
          interest_method?: string | null
          interest_rate?: number | null
          member_id?: string
          purpose?: string
          rejection_reason?: string | null
          requested_by?: string
          status?: Database["public"]["Enums"]["loan_status"]
          term_months?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loans_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "group_members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_beneficiaries: {
        Row: {
          created_at: string
          document_number: string
          document_type: string
          full_name: string
          group_id: string
          member_id: string
          phone: string
          relationship: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          document_number: string
          document_type: string
          full_name: string
          group_id: string
          member_id: string
          phone: string
          relationship: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          document_number?: string
          document_type?: string
          full_name?: string
          group_id?: string
          member_id?: string
          phone?: string
          relationship?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_beneficiaries_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_beneficiaries_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "group_members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_beneficiary_history: {
        Row: {
          changed_by: string | null
          created_at: string
          document_number: string
          document_type: string
          full_name: string
          group_id: string
          id: string
          member_id: string
          phone: string
          relationship: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          document_number: string
          document_type: string
          full_name: string
          group_id: string
          id?: string
          member_id: string
          phone: string
          relationship: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          document_number?: string
          document_type?: string
          full_name?: string
          group_id?: string
          id?: string
          member_id?: string
          phone?: string
          relationship?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_beneficiary_history_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_beneficiary_history_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "group_members"
            referencedColumns: ["id"]
          },
        ]
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
      member_status_request_votes: {
        Row: {
          created_at: string
          group_id: string
          id: string
          reason: string | null
          request_id: string
          vote: Database["public"]["Enums"]["vote_choice"]
          voter_member_id: string
          voter_user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          reason?: string | null
          request_id: string
          vote: Database["public"]["Enums"]["vote_choice"]
          voter_member_id: string
          voter_user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          reason?: string | null
          request_id?: string
          vote?: Database["public"]["Enums"]["vote_choice"]
          voter_member_id?: string
          voter_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_status_request_votes_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_status_request_votes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "member_status_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_status_request_votes_voter_member_id_fkey"
            columns: ["voter_member_id"]
            isOneToOne: false
            referencedRelation: "group_members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_status_requests: {
        Row: {
          created_at: string
          from_roles: Database["public"]["Enums"]["group_role"][] | null
          from_status: Database["public"]["Enums"]["member_status"] | null
          group_id: string
          id: string
          kind: string
          member_id: string
          reason: string
          requested_by: string
          requested_by_member: string
          requested_roles: Database["public"]["Enums"]["group_role"][] | null
          requested_status: Database["public"]["Enums"]["member_status"] | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["request_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          from_roles?: Database["public"]["Enums"]["group_role"][] | null
          from_status?: Database["public"]["Enums"]["member_status"] | null
          group_id: string
          id?: string
          kind?: string
          member_id: string
          reason: string
          requested_by: string
          requested_by_member: string
          requested_roles?: Database["public"]["Enums"]["group_role"][] | null
          requested_status?: Database["public"]["Enums"]["member_status"] | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          from_roles?: Database["public"]["Enums"]["group_role"][] | null
          from_status?: Database["public"]["Enums"]["member_status"] | null
          group_id?: string
          id?: string
          kind?: string
          member_id?: string
          reason?: string
          requested_by?: string
          requested_by_member?: string
          requested_roles?: Database["public"]["Enums"]["group_role"][] | null
          requested_status?: Database["public"]["Enums"]["member_status"] | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_status_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_status_requests_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "group_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_status_requests_requested_by_member_fkey"
            columns: ["requested_by_member"]
            isOneToOne: false
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
      savings_ledger: {
        Row: {
          amount: number
          collective_profile_id: string | null
          created_at: string
          created_by: string | null
          deposit_id: string
          group_id: string
          id: string
          kind: string
          member_id: string | null
          reason: string | null
          reverses_entry_id: string | null
        }
        Insert: {
          amount: number
          collective_profile_id?: string | null
          created_at?: string
          created_by?: string | null
          deposit_id: string
          group_id: string
          id?: string
          kind: string
          member_id?: string | null
          reason?: string | null
          reverses_entry_id?: string | null
        }
        Update: {
          amount?: number
          collective_profile_id?: string | null
          created_at?: string
          created_by?: string | null
          deposit_id?: string
          group_id?: string
          id?: string
          kind?: string
          member_id?: string | null
          reason?: string | null
          reverses_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "savings_ledger_collective_profile_id_fkey"
            columns: ["collective_profile_id"]
            isOneToOne: false
            referencedRelation: "collective_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_ledger_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: false
            referencedRelation: "deposits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_ledger_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_ledger_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "group_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_ledger_reverses_entry_id_fkey"
            columns: ["reverses_entry_id"]
            isOneToOne: false
            referencedRelation: "savings_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _active_member_id: {
        Args: { _group: string; _uid: string }
        Returns: string
      }
      _apply_status_request: {
        Args: { _request_id: string }
        Returns: undefined
      }
      _check_member_fields: {
        Args: {
          _address: string
          _birth: string
          _doc_number: string
          _doc_type: string
          _full_name: string
          _phone: string
          _profession: string
        }
        Returns: undefined
      }
      _check_not_self_finance: {
        Args: {
          _d: Database["public"]["Tables"]["deposits"]["Row"]
          _uid: string
        }
        Returns: undefined
      }
      _confirmed_user_id: { Args: { _email: string }; Returns: string }
      _in_collective: {
        Args: { _profile: string; _uid: string }
        Returns: boolean
      }
      _link_user_invites: {
        Args: { _email: string; _uid: string }
        Returns: undefined
      }
      _loan_vote_state: {
        Args: { _loan_id: string }
        Returns: Database["public"]["Enums"]["loan_status"]
      }
      _loan_voters: {
        Args: { _borrower: string; _group: string }
        Returns: string[]
      }
      _log_admin_roles: {
        Args: {
          _action: string
          _actor: string
          _actor_label: string
          _member_id: string
          _roles: Database["public"]["Enums"]["group_role"][]
        }
        Returns: undefined
      }
      _member_label: { Args: { _group: string; _uid: string }; Returns: string }
      _open_board_request: {
        Args: {
          _kind: string
          _m: Database["public"]["Tables"]["group_members"]["Row"]
          _reason: string
          _roles: Database["public"]["Enums"]["group_role"][]
          _status: Database["public"]["Enums"]["member_status"]
          _uid: string
        }
        Returns: Database["public"]["Enums"]["request_status"]
      }
      _purge_allowed: { Args: never; Returns: boolean }
      _req: { Args: { _label: string; _v: string }; Returns: string }
      _set_roles_logged: {
        Args: {
          _by: string
          _label: string
          _m: Database["public"]["Tables"]["group_members"]["Row"]
          _roles: Database["public"]["Enums"]["group_role"][]
        }
        Returns: Database["public"]["Enums"]["group_role"][]
      }
      _status_request_state: {
        Args: { _request_id: string }
        Returns: Database["public"]["Enums"]["request_status"]
      }
      _try_uuid: { Args: { _t: string }; Returns: string }
      _valid_email: { Args: { _email: string }; Returns: boolean }
      _validate_roles_change: {
        Args: {
          _m: Database["public"]["Tables"]["group_members"]["Row"]
          _roles: Database["public"]["Enums"]["group_role"][]
        }
        Returns: undefined
      }
      _validate_status_change: {
        Args: {
          _m: Database["public"]["Tables"]["group_members"]["Row"]
          _status: Database["public"]["Enums"]["member_status"]
        }
        Returns: undefined
      }
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
      cancel_loan_request: {
        Args: { _loan_id: string; _reason?: string }
        Returns: undefined
      }
      cancel_member_status_request: {
        Args: { _request_id: string }
        Returns: undefined
      }
      create_collective_profile: {
        Args: { _group_id: string; _name: string; _relation_type: string }
        Returns: string
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
      create_payment_account: {
        Args: {
          _account_number: string
          _channel: Database["public"]["Enums"]["payment_channel"]
          _group_id: string
          _holder_name: string
          _institution: string
        }
        Returns: string
      }
      group_board: {
        Args: { _group_id: string }
        Returns: {
          full_name: string
          member_id: string
          roles: Database["public"]["Enums"]["group_role"][]
        }[]
      }
      group_collective_profiles: {
        Args: { _group_id: string }
        Returns: {
          id: string
          member_count: number
          name: string
          relation_type: string
        }[]
      }
      group_directory_visible: { Args: { _group: string }; Returns: boolean }
      group_savings: {
        Args: { _group_id: string }
        Returns: {
          confirmed: number
          label: string
          pending: number
          scope: string
          target_id: string
        }[]
      }
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
      is_finance_admin: {
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
      my_savings: {
        Args: { _group_id: string }
        Returns: {
          confirmed: number
          label: string
          pending: number
          scope: string
          target_id: string
        }[]
      }
      purge_test_group_finance: {
        Args: { _group_id: string }
        Returns: undefined
      }
      request_member_roles_change: {
        Args: {
          _member_id: string
          _reason: string
          _roles: Database["public"]["Enums"]["group_role"][]
        }
        Returns: Database["public"]["Enums"]["request_status"]
      }
      request_member_status_change: {
        Args: {
          _member_id: string
          _reason: string
          _status: Database["public"]["Enums"]["member_status"]
        }
        Returns: Database["public"]["Enums"]["request_status"]
      }
      reverse_deposit: {
        Args: { _deposit_id: string; _reason: string }
        Returns: string
      }
      review_deposit: {
        Args: { _approve: boolean; _deposit_id: string; _reason?: string }
        Returns: Database["public"]["Enums"]["deposit_status"]
      }
      set_group_loan_settings: {
        Args: {
          _group_id: string
          _guarantee_required: boolean
          _interest_method: string
          _interest_rate: number
          _vote_deadline_days: number
        }
        Returns: undefined
      }
      set_member_collective_profile: {
        Args: { _member_id: string; _profile_id: string }
        Returns: undefined
      }
      set_my_beneficiary: {
        Args: {
          _document_number: string
          _document_type: string
          _full_name: string
          _member_id: string
          _phone: string
          _relationship: string
        }
        Returns: undefined
      }
      set_payment_account_active: {
        Args: { _account_id: string; _active: boolean }
        Returns: undefined
      }
      submit_deposit: {
        Args: {
          _amount: number
          _channel: Database["public"]["Enums"]["payment_channel"]
          _deposit_date: string
          _for_collective: boolean
          _group_id: string
          _notes?: string
          _payment_account_id: string
          _receipt_path: string
          _transaction_ref: string
        }
        Returns: string
      }
      submit_loan_request: {
        Args: {
          _amount: number
          _declaration_path: string
          _group_id: string
          _guarantee_description?: string
          _guarantee_path?: string
          _purpose: string
          _term_months: number
        }
        Returns: string
      }
      update_collective_profile: {
        Args: { _name: string; _profile_id: string; _relation_type: string }
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
      vote_loan: {
        Args: { _approve: boolean; _loan_id: string; _reason?: string }
        Returns: Database["public"]["Enums"]["loan_status"]
      }
      vote_member_status_request: {
        Args: { _approve: boolean; _reason?: string; _request_id: string }
        Returns: Database["public"]["Enums"]["request_status"]
      }
    }
    Enums: {
      deposit_status: "pendente" | "aprovado" | "rejeitado"
      group_role: "diretor" | "tesoureiro" | "secretario" | "membro"
      group_status: "ativo" | "suspenso"
      loan_status:
        | "submetido"
        | "em_analise"
        | "aprovado"
        | "rejeitado"
        | "cancelado"
        | "desembolsado"
        | "em_pagamento"
        | "liquidado"
        | "em_incumprimento"
      member_status:
        | "convidado"
        | "pendente_aprovacao"
        | "ativo"
        | "suspenso"
        | "excluido"
      payment_channel: "mpesa" | "emola" | "mkesh" | "banco"
      platform_role: "agroei_owner"
      request_status: "pendente" | "aprovado" | "rejeitado" | "cancelado"
      vote_choice: "aprovado" | "rejeitado"
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
      deposit_status: ["pendente", "aprovado", "rejeitado"],
      group_role: ["diretor", "tesoureiro", "secretario", "membro"],
      group_status: ["ativo", "suspenso"],
      loan_status: [
        "submetido",
        "em_analise",
        "aprovado",
        "rejeitado",
        "cancelado",
        "desembolsado",
        "em_pagamento",
        "liquidado",
        "em_incumprimento",
      ],
      member_status: [
        "convidado",
        "pendente_aprovacao",
        "ativo",
        "suspenso",
        "excluido",
      ],
      payment_channel: ["mpesa", "emola", "mkesh", "banco"],
      platform_role: ["agroei_owner"],
      request_status: ["pendente", "aprovado", "rejeitado", "cancelado"],
      vote_choice: ["aprovado", "rejeitado"],
    },
  },
} as const
