// AACSB system constants

// Canonical department labels — keep in sync with CANONICAL_DEPARTMENTS in src/lib/normalize.ts.
// All aliases (MKT, MGT, FINA, ITOM, etc.) are mapped to these via normalizeDepartment().
export const departments = [
  'Marketing',
  'Management',
  'Finance and Accounting',
  'Information Technology and Operations Management',
  'Hospitality and Tourism Management',
  'Economics',
];

// AACSB Disciplines — short codes from the LAU AKSOB database.
// Separate analytical dimension from Department.
export const disciplines = ['MGT', 'ECO', 'FIN', 'MKT', 'ACC', 'ACC & FIN', 'HTM', 'ITM'];

export const campuses = ['Beirut', 'Byblos', 'Online'];

export const icCategories = ['Basic/Discovery Scholarship', 'Applied/Integration/Application Scholarship', 'Teaching & Learning Scholarship', 'Applied/Integration Scholarship'];

export const icTypes = ['PRJ', 'Book', 'Chapter', 'Editorial Work', 'Conference Paper', 'Conference Proceedings', 'Patent', 'Other'];

export const quartiles = ['Q1', 'Q2', 'Q3', 'Q4', 'Not Ranked'];

export const abdcRanks = ['A*', 'A', 'B', 'C', 'Not Ranked'];

export const icStatuses = ['draft', 'under_review', 'verified', 'rejected'];

export const ftPtStatuses = ['FT', 'PT'];

export const academicRanks = ['Professor', 'Associate Professor', 'Assistant Professor', 'Lecturer', 'Instructor', 'Visiting Professor', 'Senior Instructor', 'Practice Lecturer', 'Practice Instructor', 'Visiting Lecturer'];

export const highestDegrees = ['PhD', 'DBA', 'EdD', 'MBA', 'MS', 'MA', 'BS', 'BA', 'JD', 'DSc', 'Other'];

export const terms = ['Fall 2025', 'Spring 2026'];

export const indexingDatabases = ['Scopus', 'Web of Science', 'IEEE', 'PubMed', 'EBSCO', 'ProQuest', 'Other'];

export const facultyQualifications = ['SA', 'PA', 'IP', 'IA', 'A', 'SP'];

export const facultySufficiencies = ['Participating', 'Supporting'];

export const tenureStatuses = ['Tenured', 'Tenure- Track', 'Non-Tenure Track'];

export const facultyStatuses = ['Full-time Faculty', 'Adjunct Faculty', 'Part-time Faculty', 'Post-Retirement Appointment', 'Faculty Retirees/Adjunct'];

// Chart color palette derived from Pantone 336
export const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];
