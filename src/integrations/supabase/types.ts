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
          description: string | null
          faculty_id: string | null
          id: string
          qualification_type: string | null
          year: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          faculty_id?: string | null
          id?: string
          qualification_type?: string | null
          year?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          faculty_id?: string | null
          id?: string
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
          campus: string | null
          created_at: string
          department: string | null
          full_name: string
          must_change_password: boolean
          password_hash: string
          role: string
          status: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          campus?: string | null
          created_at?: string
          department?: string | null
          full_name: string
          must_change_password?: boolean
          password_hash: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
          username: string
        }
        Update: {
          campus?: string | null
          created_at?: string
          department?: string | null
          full_name?: string
          must_change_password?: boolean
          password_hash?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      ar_advisors: {
        Row: {
          campus: string | null
          created_at: string | null
          department: string
          email: string | null
          id: string
          name: string
        }
        Insert: {
          campus?: string | null
          created_at?: string | null
          department: string
          email?: string | null
          id?: string
          name: string
        }
        Update: {
          campus?: string | null
          created_at?: string | null
          department?: string
          email?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      ar_students: {
        Row: {
          admit_term: string | null
          advisor_id: string | null
          aip_status: string | null
          campus: string | null
          case_status: string | null
          cgpa: number | null
          college: string | null
          concentration: string | null
          created_at: string | null
          department: string | null
          email: string | null
          follow_up_status: string | null
          id: string
          institutional_credits_earned: number | null
          intervention_outcome: string | null
          last_updated_by: string | null
          level_group: string | null
          major: string | null
          meeting_date: string | null
          meeting_status: string | null
          name: string
          notes: string | null
          phone: string | null
          program: string | null
          risk_category: string | null
          student_class: string | null
          student_id: string
          student_population: string | null
          term: string | null
          total_credits_earned: number | null
          updated_at: string | null
        }
        Insert: {
          admit_term?: string | null
          advisor_id?: string | null
          aip_status?: string | null
          campus?: string | null
          case_status?: string | null
          cgpa?: number | null
          college?: string | null
          concentration?: string | null
          created_at?: string | null
          department?: string | null
          email?: string | null
          follow_up_status?: string | null
          id?: string
          institutional_credits_earned?: number | null
          intervention_outcome?: string | null
          last_updated_by?: string | null
          level_group?: string | null
          major?: string | null
          meeting_date?: string | null
          meeting_status?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          program?: string | null
          risk_category?: string | null
          student_class?: string | null
          student_id: string
          student_population?: string | null
          term?: string | null
          total_credits_earned?: number | null
          updated_at?: string | null
        }
        Update: {
          admit_term?: string | null
          advisor_id?: string | null
          aip_status?: string | null
          campus?: string | null
          case_status?: string | null
          cgpa?: number | null
          college?: string | null
          concentration?: string | null
          created_at?: string | null
          department?: string | null
          email?: string | null
          follow_up_status?: string | null
          id?: string
          institutional_credits_earned?: number | null
          intervention_outcome?: string | null
          last_updated_by?: string | null
          level_group?: string | null
          major?: string | null
          meeting_date?: string | null
          meeting_status?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          program?: string | null
          risk_category?: string | null
          student_class?: string | null
          student_id?: string
          student_population?: string | null
          term?: string | null
          total_credits_earned?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ar_students_advisor_id_fkey"
            columns: ["advisor_id"]
            isOneToOne: false
            referencedRelation: "ar_advisors"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          target_table: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          target_table?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_table?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      awards_recognition: {
        Row: {
          award_name: string | null
          created_at: string
          faculty_id: string | null
          id: string
          year: number | null
        }
        Insert: {
          award_name?: string | null
          created_at?: string
          faculty_id?: string | null
          id?: string
          year?: number | null
        }
        Update: {
          award_name?: string | null
          created_at?: string
          faculty_id?: string | null
          id?: string
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
        Relationships: []
      }
      intellectual_contributions: {
        Row: {
          abdc_rank: string | null
          authors: string | null
          created_at: string
          doi: string | null
          faculty_id: string | null
          ic_category: string | null
          ic_id: string
          ic_type: string | null
          journal_outlet: string | null
          quartile: string | null
          status: string | null
          title: string | null
          updated_at: string
          year: number | null
        }
        Insert: {
          abdc_rank?: string | null
          authors?: string | null
          created_at?: string
          doi?: string | null
          faculty_id?: string | null
          ic_category?: string | null
          ic_id?: string
          ic_type?: string | null
          journal_outlet?: string | null
          quartile?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string
          year?: number | null
        }
        Update: {
          abdc_rank?: string | null
          authors?: string | null
          created_at?: string
          doi?: string | null
          faculty_id?: string | null
          ic_category?: string | null
          ic_id?: string
          ic_type?: string | null
          journal_outlet?: string | null
          quartile?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string
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
        ]
      }
      professional_engagements: {
        Row: {
          created_at: string
          description: string | null
          engagement_type: string | null
          faculty_id: string | null
          id: string
          year: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          engagement_type?: string | null
          faculty_id?: string | null
          id?: string
          year?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          engagement_type?: string | null
          faculty_id?: string | null
          id?: string
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
      service_contributions: {
        Row: {
          contribution_type: string | null
          created_at: string
          description: string | null
          faculty_id: string | null
          id: string
          year: number | null
        }
        Insert: {
          contribution_type?: string | null
          created_at?: string
          description?: string | null
          faculty_id?: string | null
          id?: string
          year?: number | null
        }
        Update: {
          contribution_type?: string | null
          created_at?: string
          description?: string | null
          faculty_id?: string | null
          id?: string
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
