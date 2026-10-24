// Shared types for QA Test Manager

export type ModuleStatus = 'active' | 'archived';
export type FeatureStatus = 'active' | 'archived';
export type LifecycleStatus = 'draft' | 'active' | 'obsolete' | 'archived';
export type PrepStatus = 'draft' | 'in_progress' | 'ready';
export type ExecStatus = 'not_run' | 'in_progress' | 'executed';
export type TestResult = 'pass' | 'fail' | 'blocked' | 'not_run';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type TestType = 'functional' | 'regression' | 'smoke' | 'boundary' | 'negative' | 'validation' | 'permission' | 'integration' | 'uat' | 'performance' | 'other';

export interface Module {
  id: number;
  name: string;
  description: string | null;
  prefix: string;
  status: ModuleStatus;
  created_at: string;
  updated_at: string;
  feature_count?: number;
  test_case_count?: number;
}

export interface Feature {
  id: number;
  module_id: number;
  name: string;
  description: string | null;
  status: FeatureStatus;
  created_at: string;
  updated_at: string;
  module_name?: string;
  module_prefix?: string;
  test_case_count?: number;
}

export interface TestCase {
  id: number;
  case_id: string;
  module_id: number;
  feature_id: number;
  requirement_ref: string | null;
  title: string;
  test_type: TestType;
  preconditions: string | null;
  test_steps: string | null;
  test_data: string | null;
  expected_result: string | null;
  actual_result: string | null;
  priority: Priority;
  prep_status: PrepStatus;
  exec_status: ExecStatus;
  latest_result: TestResult;
  evidence: string | null;
  defect_ref: string | null;
  notes: string | null;
  lifecycle_status: LifecycleStatus;
  created_at: string;
  updated_at: string;
  module_name?: string;
  feature_name?: string;
  module_prefix?: string;
  comment_count?: number;
}

export interface Execution {
  id: number;
  test_case_id: number;
  exec_date: string;
  environment: string | null;
  actual_result: string | null;
  result: TestResult;
  evidence: string | null;
  defect_ref: string | null;
  notes: string | null;
  is_retest: number;
  case_id?: string;
  title?: string;
}

export interface ChangeLog {
  id: number;
  entity_type: string;
  entity_id: number;
  entity_ref: string;
  change_type: string;
  changed_fields: string | null;
  old_values: string | null;
  new_values: string | null;
  reason: string | null;
  requirement_ref: string | null;
  changed_at: string;
}

export interface ActivityLog {
  id: number;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  entity_ref: string | null;
  description: string | null;
  created_at: string;
}

export interface WeeklySnapshot {
  id: number;
  week_start: string;
  week_end: string;
  snapshot_data: string;
  notes: string | null;
  activities: string | null;
  next_priorities: string | null;
  created_at: string;
}

export interface DashboardMetrics {
  totalActive: number;
  byModule: { module: string; prefix: string; total: number; ready: number; executed: number; pass: number; fail: number; blocked: number }[];
  prepProgress: { ready: number; total: number; pct: number | null };
  execProgress: { executed: number; readyTotal: number; pct: number | null };
  results: { pass: number; fail: number; blocked: number; not_run: number };
  passRate: { pass: number; total: number; pct: number | null };
  notReady: number;
  recentActivity: ActivityLog[];
  weeklyChange: { added: number; updated: number; obsolete: number; reactivated: number };
}

export interface AIDraft {
  id?: number;
  case_id?: string;
  module_id: number;
  feature_id: number;
  title: string;
  test_type: TestType;
  preconditions: string;
  test_steps: string;
  test_data: string;
  expected_result: string;
  priority: Priority;
  requirement_ref: string;
  notes: string;
  isDuplicate?: boolean;
  duplicateOf?: string;
  selected?: boolean;
}

export interface Requirement {
  id: number;
  module_id: number | null;
  feature_id: number | null;
  ref_id: string | null;
  title: string;
  description: string | null;
  change_type: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
  module_name?: string;
  feature_name?: string;
}

export const TEST_TYPES: { value: TestType; label: string }[] = [
  { value: 'functional', label: 'Functional' },
  { value: 'regression', label: 'Regression' },
  { value: 'smoke', label: 'Smoke Test' },
  { value: 'boundary', label: 'Boundary' },
  { value: 'negative', label: 'Negative' },
  { value: 'validation', label: 'Validation' },
  { value: 'permission', label: 'Permission' },
  { value: 'integration', label: 'Integration' },
  { value: 'uat', label: 'UAT' },
  { value: 'performance', label: 'Performance' },
  { value: 'other', label: 'Other' },
];

export const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

export const PREP_STATUSES: { value: PrepStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'ready', label: 'Ready' },
];

export const EXEC_STATUSES: { value: ExecStatus; label: string }[] = [
  { value: 'not_run', label: 'Not Run' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'executed', label: 'Executed' },
];

export const TEST_RESULTS: { value: TestResult; label: string; color: string }[] = [
  { value: 'pass', label: 'Pass', color: 'success' },
  { value: 'fail', label: 'Fail', color: 'error' },
  { value: 'blocked', label: 'Blocked', color: 'warning' },
  { value: 'not_run', label: 'Not Run', color: 'muted' },
];

export const LIFECYCLE_STATUSES: { value: LifecycleStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'obsolete', label: 'Obsolete' },
  { value: 'archived', label: 'Archived' },
];

export type CommentAuthorRole = 'pm' | 'developer' | 'qa';
export type CommentStatus = 'pending' | 'reviewed' | 'resolved';

export interface TestCaseComment {
  id: number;
  test_case_id: number;
  author_name: string;
  author_role: CommentAuthorRole;
  content: string;
  status: CommentStatus;
  reply: string | null;
  replied_at: string | null;
  created_at: string;
  resolved_at: string | null;
  case_id?: string;
  test_case_title?: string;
  module_name?: string;
  feature_name?: string;
  priority?: Priority;
}

export interface FeedbackInboxStats {
  total: number;
  pending: number;
  reviewed: number;
  resolved: number;
}
