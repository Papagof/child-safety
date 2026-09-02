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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string
          created_at: string
          details: Json | null
          id: string
          org_id: string
          session_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role: string
          created_at?: string
          details?: Json | null
          id?: string
          org_id: string
          session_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string
          created_at?: string
          details?: Json | null
          id?: string
          org_id?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          body: string
          created_at: string
          escalated: boolean
          id: string
          org_id: string
          read_at: string | null
          sender_id: string
          sender_role: string
          thread_id: string
          urgent: boolean
        }
        Insert: {
          body: string
          created_at?: string
          escalated?: boolean
          id?: string
          org_id: string
          read_at?: string | null
          sender_id: string
          sender_role: string
          thread_id: string
          urgent?: boolean
        }
        Update: {
          body?: string
          created_at?: string
          escalated?: boolean
          id?: string
          org_id?: string
          read_at?: string | null
          sender_id?: string
          sender_role?: string
          thread_id?: string
          urgent?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          created_at: string
          guardian_id: string
          id: string
          org_id: string
          room_id: string
          session_id: string
          status: string
        }
        Insert: {
          created_at?: string
          guardian_id: string
          id?: string
          org_id: string
          room_id: string
          session_id: string
          status?: string
        }
        Update: {
          created_at?: string
          guardian_id?: string
          id?: string
          org_id?: string
          room_id?: string
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_threads_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      children: {
        Row: {
          archived_at: string | null
          created_at: string
          default_room_id: string | null
          dob: string
          full_name: string
          guardian_id: string
          id: string
          medical_notes: string | null
          photo_url: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          default_room_id?: string | null
          dob: string
          full_name: string
          guardian_id: string
          id?: string
          medical_notes?: string | null
          photo_url?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          default_room_id?: string | null
          dob?: string
          full_name?: string
          guardian_id?: string
          id?: string
          medical_notes?: string | null
          photo_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "children_default_room_id_fkey"
            columns: ["default_room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "children_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          created_at: string
          description: string | null
          id: string
          org_id: string
          reported_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          room_id: string | null
          session_id: string | null
          status: string
          type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          org_id: string
          reported_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          room_id?: string | null
          session_id?: string | null
          status?: string
          type: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          org_id?: string
          reported_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          room_id?: string | null
          session_id?: string | null
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          read_at: string | null
          session_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          session_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          session_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          invite_code: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          invite_code: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          invite_code?: string
          name?: string
        }
        Relationships: []
      }
      pickup_people: {
        Row: {
          added_by: string
          blocked_reason: string | null
          child_id: string
          created_at: string
          full_name: string
          id: string
          id_reference: string | null
          photo_url: string | null
          relationship: string
          status: string
        }
        Insert: {
          added_by: string
          blocked_reason?: string | null
          child_id: string
          created_at?: string
          full_name: string
          id?: string
          id_reference?: string | null
          photo_url?: string | null
          relationship: string
          status?: string
        }
        Update: {
          added_by?: string
          blocked_reason?: string | null
          child_id?: string
          created_at?: string
          full_name?: string
          id?: string
          id_reference?: string | null
          photo_url?: string | null
          relationship?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pickup_people_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_people_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          consent_at: string | null
          created_at: string
          full_name: string
          id: string
          org_id: string
          phone: string | null
          photo_url: string | null
          role: string
        }
        Insert: {
          consent_at?: string | null
          created_at?: string
          full_name: string
          id: string
          org_id: string
          phone?: string | null
          photo_url?: string | null
          role: string
        }
        Update: {
          consent_at?: string | null
          created_at?: string
          full_name?: string
          id?: string
          org_id?: string
          phone?: string | null
          photo_url?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          active: boolean
          age_max: number
          age_min: number
          capacity: number
          id: string
          name: string
          org_id: string
        }
        Insert: {
          active?: boolean
          age_max?: number
          age_min?: number
          capacity?: number
          id?: string
          name: string
          org_id?: string
        }
        Update: {
          active?: boolean
          age_max?: number
          age_min?: number
          capacity?: number
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          checkin_accepted_at: string | null
          checkin_code: string | null
          checkin_code_expires_at: string | null
          checkin_decline_reason: string | null
          checkin_requested_at: string | null
          checkin_staff_id: string | null
          checkout_approved_at: string | null
          checkout_code: string | null
          checkout_code_expires_at: string | null
          checkout_requested_at: string | null
          checkout_requested_by_id: string | null
          checkout_requested_by_type: string | null
          checkout_staff_id: string | null
          child_id: string
          created_at: string
          id: string
          is_transfer: boolean
          noshow_flagged: boolean
          org_id: string
          room_id: string
          service_date: string
          status: string
          transferred_from_session_id: string | null
        }
        Insert: {
          checkin_accepted_at?: string | null
          checkin_code?: string | null
          checkin_code_expires_at?: string | null
          checkin_decline_reason?: string | null
          checkin_requested_at?: string | null
          checkin_staff_id?: string | null
          checkout_approved_at?: string | null
          checkout_code?: string | null
          checkout_code_expires_at?: string | null
          checkout_requested_at?: string | null
          checkout_requested_by_id?: string | null
          checkout_requested_by_type?: string | null
          checkout_staff_id?: string | null
          child_id: string
          created_at?: string
          id?: string
          is_transfer?: boolean
          noshow_flagged?: boolean
          org_id: string
          room_id: string
          service_date: string
          status: string
          transferred_from_session_id?: string | null
        }
        Update: {
          checkin_accepted_at?: string | null
          checkin_code?: string | null
          checkin_code_expires_at?: string | null
          checkin_decline_reason?: string | null
          checkin_requested_at?: string | null
          checkin_staff_id?: string | null
          checkout_approved_at?: string | null
          checkout_code?: string | null
          checkout_code_expires_at?: string | null
          checkout_requested_at?: string | null
          checkout_requested_by_id?: string | null
          checkout_requested_by_type?: string | null
          checkout_staff_id?: string | null
          child_id?: string
          created_at?: string
          id?: string
          is_transfer?: boolean
          noshow_flagged?: boolean
          org_id?: string
          room_id?: string
          service_date?: string
          status?: string
          transferred_from_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_checkin_staff_id_fkey"
            columns: ["checkin_staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_checkout_staff_id_fkey"
            columns: ["checkout_staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_transferred_from_session_id_fkey"
            columns: ["transferred_from_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_details: {
        Row: {
          approval_status: string
          background_check_status: string
          created_at: string
          user_id: string
        }
        Insert: {
          approval_status?: string
          background_check_status?: string
          created_at?: string
          user_id: string
        }
        Update: {
          approval_status?: string
          background_check_status?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_details_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_rooms: {
        Row: {
          room_id: string
          staff_id: string
        }
        Insert: {
          room_id: string
          staff_id: string
        }
        Update: {
          room_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_rooms_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_rooms_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_checkin: {
        Args: { p_code: string; p_session_id: string }
        Returns: Json
      }
      admin_override_checkout: {
        Args: { p_reason: string; p_session_id: string }
        Returns: Json
      }
      admin_set_child_room: {
        Args: { p_child_id: string; p_room_id?: string }
        Returns: Json
      }
      age_from_dob: { Args: { p_dob: string }; Returns: number }
      approve_checkout: {
        Args: { p_code: string; p_session_id: string }
        Returns: Json
      }
      approve_staff: { Args: { p_user_id: string }; Returns: undefined }
      create_notification: {
        Args: {
          p_body: string
          p_session_id?: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: undefined
      }
      create_organization: {
        Args: { p_consent?: boolean; p_full_name: string; p_name: string }
        Returns: Json
      }
      decline_checkin: {
        Args: { p_reason?: string; p_session_id: string }
        Returns: Json
      }
      escalate_unread_urgent_messages: { Args: never; Returns: undefined }
      flag_noshow_pickups: { Args: never; Returns: undefined }
      flag_pickup_mismatch: {
        Args: { p_description?: string; p_session_id: string }
        Returns: Json
      }
      generate_code: { Args: { p_length?: number }; Returns: string }
      get_attendance_report: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      get_incidents_report: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      get_invite_code: { Args: never; Returns: string }
      get_live_counts: { Args: never; Returns: Json }
      get_live_sessions: { Args: never; Returns: Json }
      get_my_org_id: { Args: never; Returns: string }
      get_my_profile: { Args: never; Returns: Json }
      get_my_sessions: { Args: never; Returns: Json }
      get_pickup_time_report: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      get_room_sessions: { Args: { p_room_id: string }; Returns: Json }
      get_session: { Args: { p_id: string }; Returns: Json }
      get_thread_messages: { Args: { p_session_id: string }; Returns: Json }
      get_unread_notification_count: { Args: never; Returns: number }
      is_admin: { Args: never; Returns: boolean }
      is_approved_staff: { Args: never; Returns: boolean }
      is_staff_assigned_to_room: {
        Args: { p_room_id: string; p_staff_id: string }
        Returns: boolean
      }
      is_thread_participant: { Args: { p_thread_id: string }; Returns: boolean }
      join_organization_by_invite: {
        Args: {
          p_consent?: boolean
          p_full_name: string
          p_invite_code: string
          p_phone?: string
        }
        Returns: Json
      }
      list_audit_log: {
        Args: {
          p_action?: string
          p_actor_role?: string
          p_child_id?: string
          p_from?: string
          p_room_id?: string
          p_session_id?: string
          p_to?: string
        }
        Returns: Json
      }
      list_notifications: { Args: { p_limit?: number }; Returns: Json }
      list_sessions: {
        Args: {
          p_child_id?: string
          p_date?: string
          p_room_id?: string
          p_status?: string
        }
        Returns: Json
      }
      list_staff_accounts: { Args: never; Returns: Json }
      mark_all_notifications_read: { Args: never; Returns: undefined }
      mark_notification_read: { Args: { p_id: string }; Returns: undefined }
      mark_thread_read: { Args: { p_session_id: string }; Returns: undefined }
      notify_org_admins: {
        Args: {
          p_body: string
          p_org_id: string
          p_session_id?: string
          p_title: string
          p_type: string
        }
        Returns: undefined
      }
      notify_room_staff: {
        Args: {
          p_body: string
          p_room_id: string
          p_session_id?: string
          p_title: string
          p_type: string
        }
        Returns: undefined
      }
      notify_session_update: {
        Args: { p_session: Database["public"]["Tables"]["sessions"]["Row"] }
        Returns: undefined
      }
      post_chat_message: {
        Args: { p_body: string; p_session_id: string; p_urgent?: boolean }
        Returns: Json
      }
      purge_old_records: { Args: { p_before: string }; Returns: Json }
      regenerate_invite_code: { Args: never; Returns: string }
      reject_staff: { Args: { p_user_id: string }; Returns: undefined }
      report_incident: {
        Args: { p_description: string; p_room_id: string }
        Returns: Json
      }
      request_checkin: {
        Args: { p_child_id: string; p_room_id: string }
        Returns: Json
      }
      request_checkout: {
        Args: { p_pickup_person_id?: string; p_session_id: string }
        Returns: Json
      }
      resolve_incident: { Args: { p_id: string }; Returns: Json }
      session_payload: {
        Args: {
          p_include_codes: boolean
          p_session: Database["public"]["Tables"]["sessions"]["Row"]
        }
        Returns: Json
      }
      set_background_check_status: {
        Args: { p_status: string; p_user_id: string }
        Returns: undefined
      }
      set_staff_rooms: {
        Args: { p_room_ids: string[]; p_user_id: string }
        Returns: undefined
      }
      staff_has_active_session_for_child_today: {
        Args: { p_child_id: string }
        Returns: boolean
      }
      today_service_date: { Args: never; Returns: string }
      transfer_session: {
        Args: { p_new_room_id: string; p_session_id: string }
        Returns: Json
      }
      update_my_photo: { Args: { p_photo_url: string }; Returns: undefined }
      update_pickup_person: {
        Args: {
          p_blocked_reason?: string
          p_full_name?: string
          p_id: string
          p_id_reference?: string
          p_photo_url?: string
          p_relationship?: string
          p_status?: string
        }
        Returns: {
          added_by: string
          blocked_reason: string | null
          child_id: string
          created_at: string
          full_name: string
          id: string
          id_reference: string | null
          photo_url: string | null
          relationship: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "pickup_people"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
