import { describe, expect, it } from 'vitest';
import { parseCvText } from '../../supabase/functions/parse-cv/parser';

const mayaFixture = `
## 1. Personal & Academic Information
Last Name: Farah Jibai
First Name: Maya
Department: MKT
ID Number: 199705300
Campus: Beirut
Academic Rank: Professor
Status: Full-Time
Date Joining AKSOB: Feb-2012
Highest Degree Earned: PhD
Date of the Highest Degree: 2007

## 2. Academic Academic & Professional Qualifications
Degree / Certification | Institution | Year | Field / Area
Phd | University of Manchester | 2003-2007 | Marketing
MBA | Lebanese American University | 2000-2002 | Business Administration

## 3. Intellectual Contributions (ICs)
### 3.1. Peer-Reviewed Journal Articles (PRJs)
Citation (APA Style) | Scopus Rank | IC Category
Ramadan, Z., Farah, M. F., & Nassereddine, Y. (2025). The role of generative AI in shaping consumer–brand relationships. Marketing Intelligence & Planning, 1-17. Doi: 10.1108/MIP-01-2025-0058 | Q2 | Applied/Integration Scholarship

### 3.2. Books
Citation (APA Style) | Publisher Name | IC Category
Click or tap here to enter text. | Enter text. | Choose an item.

### 3.3. Chapters in Edited Books
Citation (APA Style) | Publisher Name | IC Category
Farah, M.F., Ramadan, Z., Sammouri, W., and Tawk, P. (2024, June), “Digital Luxury Fashion Shows”. Springer Proceedings in Business and Economics. | Springer Nature Switzerland | Basic/Discovery Scholarship

### 3.4. Other Intellectual Contributions
Year | Type of Contributions | IC Category | Details
2025 | Academic Conference Proceeding | Choose an item. | Ramadan, Z., Farah, M.F., and Nassereddine, Y. (2025, June 20 – 22), “Shaping Inclusive Policy for a Virtual World
: Ensuring Disability Acceptance in the Metaverse”, AMA Marketing and Public Policy Conference, Washington D.C.: USA

### Academic Engagement Activities
Year | Category | [___] | Description
2022 | Editorial Position | Choose an item. | Appointed on the Editorial Review Board of the International Journal of Bank Marketing.

## 4. Professional Engagement Activities
From-To | Activity | Details
2006-Present | Member of a Business Professional Association | Society for Marketing Advances (SMA)
2022 | Engaging in CSR Activities | Organized and chaired a roundtable at AKSOB.
Enter Year | Choose an item. | Click or tap here to enter text.

## 5. Service Contributions
From-To | Level | Committee / Role
2015-PRESENT | School | Providing continuous mentorship services to new marketing faculty at LAU – AKSOB
FALL 2025 | Department | Launched two minor programs in the Marketing Department at AKSOB: Minor in Fashion Marketing and a Minor in Digital Marketing

## 6. Awards & Recognition
Year | Award / Recognition | Institution / Organization
2024 | Best Research Paper Award | Emerald Publishing
Enter Year | Click or tap here to enter text. | Click or tap here to enter text.
`;

describe('AACSB CV parser', () => {
  it('extracts all supported sections and skips placeholders without dropping sections', () => {
    const result = parseCvText(mayaFixture);
    expect(result.ok).toBe(true);
    expect(result.data?.qualifications).toHaveLength(2);
    expect(result.data?.engagements).toHaveLength(2);
    expect(result.data?.services).toHaveLength(2);
    expect(result.data?.awards).toHaveLength(1);
    expect(result.data?.intellectual_contributions).toHaveLength(4);
    expect(result.diagnostics?.section_summary?.other_ics.ready).toBe(1);
    expect(result.diagnostics?.section_summary?.academic_engagement.ready).toBe(1);
    expect(result.diagnostics?.section_summary?.books.ignored_placeholder).toBeGreaterThan(0);
    expect(result.diagnostics?.section_summary?.professional_engagement.ready).toBe(2);
  });

  it('treats split continuation lines as one row instead of dropping the record', () => {
    const result = parseCvText(mayaFixture);
    const otherIc = result.data?.intellectual_contributions.find((row) => String(row.source_section).includes('Other Intellectual'));
    expect(otherIc).toBeTruthy();
    expect(String(otherIc?.apa_citation)).toContain('Ensuring Disability Acceptance in the Metaverse');
    expect(result.diagnostics?.section_summary?.other_ics.needs_review).toBe(0);
  });
});
