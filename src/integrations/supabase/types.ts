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
      academic_qualifications: {
        Row: {
          created_at: string
          degree_certification: string | null
          description: string | null
          faculty_id: string | null
          field_area: string | null
          id: string
          institution: string | null
          qualification_type: string | null
          year: number | null
        }
        Insert: {
          created_at?: string
          degree_certification?: string | null
          description?: string | null
          faculty_id?: string | null
          field_area?: string | null
          id?: string
          institution?: string | null
          qualification_type?: string | null
          year?: number | null
        }
        Update: {
          created_at?: string
          degree_certification?: string | null
          description?: string | null
          faculty_id?: string | null
          field_area?: string | null
          id?: string
          institution?: string | null
          qualification_type?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "academic_qualifications_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "faculty_profiles"
            referencedColumns: ["faculty_id"]
          },
        ]
      }
      app_users: {
        Row: {
          auth_user_id: string | null
          campus: string | null
          created_at: string
          department: string | null
          full_name: string
          must_change_password: boolean
          password_hash: string | null
          role: string
          status: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          auth_user_id?: string | null
          campus?: string | null
          created_at?: string
          department?: string | null
          full_name: string
          must_change_password?: boolean
          password_hash?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
          username: string
        }
        Update: {
          auth_user_id?: string | null
          campus?: string | null
          created_at?: string
          department?: string | null
          full_name?: string
          must_change_password?: boolean
          password_hash?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          target_record: string | null
          target_table: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          target_record?: string | null
          target_table?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_record?: string | null
          target_table?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      awards_recognition: {
        Row: {
          award: string | null
          award_name: string | null
          created_at: string
          faculty_id: string | null
          id: string
          institution_organization: string | null
          original_cv_item_type: string | null
          year: number | null
        }
        Insert: {
          award?: string | null
          award_name?: string | null
          created_at?: string
          faculty_id?: string | null
          id?: string
          institution_organization?: string | null
          original_cv_item_type?: string | null
          year?: number | null
        }
        Update: {
          award?: string | null
          award_name?: string | null
          created_at?: string
          faculty_id?: string | null
          id?: string
          institution_organization?: string | null
          original_cv_item_type?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "awards_recognition_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "faculty_profiles"
            referencedColumns: ["faculty_id"]
          },
        ]
      }
      cv_uploads: {
        Row: {
          changes_summary: Json | null
          created_at: string
          faculty_id: string
          file_name: string
          ics_added: number | null
          ics_skipped: number | null
          ics_updated: number | null
          id: string
          parsing_quality_score: number | null
          parsing_timestamp: string | null
          profile_fields_updated: number | null
          status: string
          upload_timestamp: string
          user_id: string | null
        }
        Insert: {
          changes_summary?: Json | null
          created_at?: string
          faculty_id: string
          file_name: string
          ics_added?: number | null
          ics_skipped?: number | null
          ics_updated?: number | null
          id?: string
          parsing_quality_score?: number | null
          parsing_timestamp?: string | null
          profile_fields_updated?: number | null
          status?: string
          upload_timestamp?: string
          user_id?: string | null
        }
        Update: {
          changes_summary?: Json | null
          created_at?: string
          faculty_id?: string
          file_name?: string
          ics_added?: number | null
          ics_skipped?: number | null
          ics_updated?: number | null
          id?: string
          parsing_quality_score?: number | null
          parsing_timestamp?: string | null
          profile_fields_updated?: number | null
          status?: string
          upload_timestamp?: string
          user_id?: string | null
        }
        Relationships: []
      }
      faculty_profiles: {
        Row: {
          academic_rank: string | null
          admin_title: string | null
          campus: string | null
          created_at: string
          date_joining_aksob: string | null
          degree_country: string | null
          degree_institution: string | null
          degree_major: string | null
          department: string | null
          discipline: string | null
          discipline_program: string | null
          email: string | null
          employee_id: string | null
          faculty_id: string
          faculty_qualification: string | null
          faculty_sufficiency: string | null
          first_name: string | null
          ft_pt_status: string | null
          highest_degree: string | null
          highest_degree_date: string | null
          last_name: string | null
          middle_names: string | null
          tenure_status: string | null
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          academic_rank?: string | null
          admin_title?: string | null
          campus?: string | null
          created_at?: string
          date_joining_aksob?: string | null
          degree_country?: string | null
          degree_institution?: string | null
          degree_major?: string | null
          department?: string | null
          discipline?: string | null
          discipline_program?: string | null
          email?: string | null
          employee_id?: string | null
          faculty_id?: string
          faculty_qualification?: string | null
          faculty_sufficiency?: string | null
          first_name?: string | null
          ft_pt_status?: string | null
          highest_degree?: string | null
          highest_degree_date?: string | null
          last_name?: string | null
          middle_names?: string | null
          tenure_status?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          academic_rank?: string | null
          admin_title?: string | null
          campus?: string | null
          created_at?: string
          date_joining_aksob?: string | null
          degree_country?: string | null
          degree_institution?: string | null
          degree_major?: string | null
          department?: string | null
          discipline?: string | null
          discipline_program?: string | null
          email?: string | null
          employee_id?: string | null
          faculty_id?: string
          faculty_qualification?: string | null
          faculty_sufficiency?: string | null
          first_name?: string | null
          ft_pt_status?: string | null
          highest_degree?: string | null
          highest_degree_date?: string | null
          last_name?: string | null
          middle_names?: string | null
          tenure_status?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "faculty_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      intellectual_contributions: {
        Row: {
          abdc_rank: string | null
          admin_notes: string | null
          apa_citation: string | null
          authors: string | null
          canonical_key: string | null
          created_at: string
          doi: string | null
          evidence_file_url: string | null
          evidence_status: string | null
          faculty_id: string | null
          ic_category: string | null
          ic_id: string
          ic_reporting_type: string | null
          ic_type: string | null
          impact_factor: string | null
          indexing_database: string | null
          journal_outlet: string | null
          original_cv_item_type: string | null
          quartile: string | null
          reclassified_at: string | null
          reclassified_by: string | null
          record_class: string
          rejection_reason: string | null
          status: string | null
          title: string | null
          updated_at: string
          verification_date: string | null
          verification_status: string
          verified_by: string | null
          year: number | null
        }
        Insert: {
          abdc_rank?: string | null
          admin_notes?: string | null
          apa_citation?: string | null
          authors?: string | null
          canonical_key?: string | null
          created_at?: string
          doi?: string | null
          evidence_file_url?: string | null
          evidence_status?: string | null
          faculty_id?: string | null
          ic_category?: string | null
          ic_id?: string
          ic_reporting_type?: string | null
          ic_type?: string | null
          impact_factor?: string | null
          indexing_database?: string | null
          journal_outlet?: string | null
          original_cv_item_type?: string | null
          quartile?: string | null
          reclassified_at?: string | null
          reclassified_by?: string | null
          record_class?: string
          rejection_reason?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string
          verification_date?: string | null
          verification_status?: string
          verified_by?: string | null
          year?: number | null
        }
        Update: {
          abdc_rank?: string | null
          admin_notes?: string | null
          apa_citation?: string | null
          authors?: string | null
          canonical_key?: string | null
          created_at?: string
          doi?: string | null
          evidence_file_url?: string | null
          evidence_status?: string | null
          faculty_id?: string | null
          ic_category?: string | null
          ic_id?: string
          ic_reporting_type?: string | null
          ic_type?: string | null
          impact_factor?: string | null
          indexing_database?: string | null
          journal_outlet?: string | null
          original_cv_item_type?: string | null
          quartile?: string | null
          reclassified_at?: string | null
          reclassified_by?: string | null
          record_class?: string
          rejection_reason?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string
          verification_date?: string | null
          verification_status?: string
          verified_by?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "intellectual_contributions_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "faculty_profiles"
            referencedColumns: ["faculty_id"]
          },
          {
            foreignKeyName: "intellectual_contributions_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      professional_engagements: {
        Row: {
          activity: string | null
          created_at: string
          description: string | null
          details: string | null
          engagement_type: string | null
          faculty_id: string | null
          from_to: string | null
          id: string
          original_cv_item_type: string | null
          proof_file_path: string | null
          proof_review_comment: string | null
          proof_reviewed_at: string | null
          proof_reviewed_by: string | null
          proof_status: string | null
          year: number | null
        }
        Insert: {
          activity?: string | null
          created_at?: string
          description?: string | null
          details?: string | null
          engagement_type?: string | null
          faculty_id?: string | null
          from_to?: string | null
          id?: string
          original_cv_item_type?: string | null
          proof_file_path?: string | null
          proof_review_comment?: string | null
          proof_reviewed_at?: string | null
          proof_reviewed_by?: string | null
          proof_status?: string | null
          year?: number | null
        }
        Update: {
          activity?: string | null
          created_at?: string
          description?: string | null
          details?: string | null
          engagement_type?: string | null
          faculty_id?: string | null
          from_to?: string | null
          id?: string
          original_cv_item_type?: string | null
          proof_file_path?: string | null
          proof_review_comment?: string | null
          proof_reviewed_at?: string | null
          proof_reviewed_by?: string | null
          proof_status?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "professional_engagements_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "faculty_profiles"
            referencedColumns: ["faculty_id"]
          },
        ]
      }
      professional_experience: {
        Row: {
          created_at: string
          faculty_id: string | null
          id: string
          key_responsibilities: string | null
          organization: string | null
          original_cv_item_type: string | null
          period: string | null
          position_title: string | null
          proof_file_path: string | null
          proof_review_comment: string | null
          proof_reviewed_at: string | null
          proof_reviewed_by: string | null
          proof_status: string | null
        }
        Insert: {
          created_at?: string
          faculty_id?: string | null
          id?: string
          key_responsibilities?: string | null
          organization?: string | null
          original_cv_item_type?: string | null
          period?: string | null
          position_title?: string | null
          proof_file_path?: string | null
          proof_review_comment?: string | null
          proof_reviewed_at?: string | null
          proof_reviewed_by?: string | null
          proof_status?: string | null
        }
        Update: {
          created_at?: string
          faculty_id?: string | null
          id?: string
          key_responsibilities?: string | null
          organization?: string | null
          original_cv_item_type?: string | null
          period?: string | null
          position_title?: string | null
          proof_file_path?: string | null
          proof_review_comment?: string | null
          proof_reviewed_at?: string | null
          proof_reviewed_by?: string | null
          proof_status?: string | null
        }
        Relationships: []
      }
      service_contributions: {
        Row: {
          committee_role: string | null
          contribution_type: string | null
          created_at: string
          description: string | null
          faculty_id: string | null
          from_to: string | null
          id: string
          level: string | null
          original_cv_item_type: string | null
          proof_file_path: string | null
          proof_review_comment: string | null
          proof_reviewed_at: string | null
          proof_reviewed_by: string | null
          proof_status: string | null
          year: number | null
        }
        Insert: {
          committee_role?: string | null
          contribution_type?: string | null
          created_at?: string
          description?: string | null
          faculty_id?: string | null
          from_to?: string | null
          id?: string
          level?: string | null
          original_cv_item_type?: string | null
          proof_file_path?: string | null
          proof_review_comment?: string | null
          proof_reviewed_at?: string | null
          proof_reviewed_by?: string | null
          proof_status?: string | null
          year?: number | null
        }
        Update: {
          committee_role?: string | null
          contribution_type?: string | null
          created_at?: string
          description?: string | null
          faculty_id?: string | null
          from_to?: string | null
          id?: string
          level?: string | null
          original_cv_item_type?: string | null
          proof_file_path?: string | null
          proof_review_comment?: string | null
          proof_reviewed_at?: string | null
          proof_reviewed_by?: string | null
          proof_status?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_contributions_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "faculty_profiles"
            referencedColumns: ["faculty_id"]
          },
        ]
      }
      teaching_load: {
        Row: {
          campus: string | null
          course_code: string | null
          course_title: string | null
          created_at: string
          credits: number | null
          faculty_id: string | null
          section: string | null
          teaching_id: string
          term: string | null
        }
        Insert: {
          campus?: string | null
          course_code?: string | null
          course_title?: string | null
          created_at?: string
          credits?: number | null
          faculty_id?: string | null
          section?: string | null
          teaching_id?: string
          term?: string | null
        }
        Update: {
          campus?: string | null
          course_code?: string | null
          course_title?: string | null
          created_at?: string
          credits?: number | null
          faculty_id?: string | null
          section?: string | null
          teaching_id?: string
          term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teaching_load_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "faculty_profiles"
            referencedColumns: ["faculty_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_edit_faculty: { Args: { _faculty_id: string }; Returns: boolean }
      can_view_faculty: { Args: { _faculty_id: string }; Returns: boolean }
      canonical_department: { Args: { v: string }; Returns: string }
      canonical_discipline: { Args: { v: string }; Returns: string }
      canonical_ft_pt: { Args: { v: string }; Returns: string }
      clean_cv: { Args: { v: string }; Returns: string }
      current_app_user_id: { Args: never; Returns: string }
      current_department: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_cv_noise: { Args: { v: string }; Returns: boolean }
      is_hod: { Args: never; Returns: boolean }
      norm_doi: { Args: { v: string }; Returns: string }
      norm_text: { Args: { v: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "hod" | "faculty"
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
      app_role: ["admin", "hod", "faculty"],
    },
  },
} as const
