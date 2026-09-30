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
    // Academic Engagement Activities are reported separately and must not inflate IC totals.
    expect(result.data?.intellectual_contributions).toHaveLength(3);
    expect(result.data?.academic_engagement).toHaveLength(1);
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

function buildPrjFixture(citation: string) {
  return `
## 3. Intellectual Contributions (ICs)
### 3.1. Peer-Reviewed Journal Articles (PRJs)
Citation (APA Style) | Scopus Rank | IC Category
${citation} | Q1 | Applied/Integration Scholarship
`;
}

describe('APA citation field mapping', () => {
  it('maps DOI url to doi (not journal) and extracts journal cleanly', () => {
    const cite = 'Itani, Omar S., Jaramillo, F., and Paesbrugghe, B. (2020). Between a rock and a hard place: Seizing the opportunity of demanding customers by means of frontline service behaviors. Journal of Retailing and Consumer Services, 53, 101978. https://doi.org/10.1016/j.jretconser.2019.101978';
    const r = parseCvText(buildPrjFixture(cite));
    const ic = r.data?.intellectual_contributions[0] as any;
    expect(ic.year).toBe(2020);
    expect(ic.doi).toMatch(/10\.1016\/j\.jretconser\.2019\.101978/);
    expect(ic.journal_outlet).toBe('Journal of Retailing and Consumer Services');
    expect(ic.authors).toMatch(/^Itani, Omar S\./);
    expect(ic.journal_outlet).not.toMatch(/doi|http/i);
  });

  it('handles citations without DOI and leaves doi blank', () => {
    const cite = 'Smith, J., & Doe, A. (2019). A study of things. Journal of Things, 12(3), 100-120.';
    const r = parseCvText(buildPrjFixture(cite));
    const ic = r.data?.intellectual_contributions[0] as any;
    expect(ic.year).toBe(2019);
    expect(ic.doi).toBeNull();
    expect(ic.journal_outlet).toBe('Journal of Things');
    expect(ic.authors).toMatch(/^Smith, J\., & Doe, A/);
  });

  it('handles bare 10.x DOI without doi.org url', () => {
    const cite = 'Brown, K. (2021). Title here. Some Journal, 5, 1-10. doi:10.1234/abcd.efgh';
    const r = parseCvText(buildPrjFixture(cite));
    const ic = r.data?.intellectual_contributions[0] as any;
    expect(ic.doi).toBe('10.1234/abcd.efgh');
    expect(ic.journal_outlet).toBe('Some Journal');
  });

  it('multi-author conference paper without journal stays clean', () => {
    const cite = 'Lee, A., Kim, B., & Park, C. (2022). Novel approach. Proceedings of the AMA Conference, Boston, USA.';
    const r = parseCvText(buildPrjFixture(cite));
    const ic = r.data?.intellectual_contributions[0] as any;
    expect(ic.year).toBe(2022);
    expect(ic.authors).toMatch(/Lee, A\./);
    expect(ic.journal_outlet).toMatch(/Proceedings of the AMA Conference/);
    expect(ic.doi).toBeNull();
  });
});

import { parseApaCitation, repairSplitWords } from '../../supabase/functions/parse-cv/parser';

describe('Pilot hardening — citation splitting regressions', () => {
  it('APA with month in year: (2025, July) conference paper', () => {
    const r = parseApaCitation('Aad, S., Hardey, M., & Kirikkaleli, N. O. (2025, July). AI and Student Influencers: A Double-Edged Sword of Digital Transformation. Paper accepted for presentation at the 85th Annual Meeting of the Academy of Management (MED Division), Copenhagen, Denmark.');
    expect(r.year).toBe(2025);
    expect(r.title).toBe('AI and Student Influencers: A Double-Edged Sword of Digital Transformation');
    expect(r.journal).toMatch(/^85th Annual Meeting of the Academy of Management/);
    expect(r.authors).toMatch(/^Aad, S\./);
  });
  it('Harvard style: Authors, 2022. Title. Journal', () => {
    const r = parseApaCitation("Kertechian, K.S., Karkoulian, S., Ismail, H.N. and Aad Makhoul, S.S., 2022. A between-subject design to evaluate students' employability in the Lebanese labor market. Higher Education, Skills and Work-Based Learning, 12(4), pp.732-748.");
    expect(r.year).toBe(2022);
    expect(r.title).toMatch(/^A between-subject design/);
    expect(r.journal).toBe('Higher Education, Skills and Work-Based Learning');
  });
  it('MLA style: quoted title before (year)', () => {
    const r = parseApaCitation('Srour, F. Jordan, and Silva Karkoulian. "Exploring diversity through machine learning: a case for the use of decision trees in social science research." International Journal of Social Research Methodology 25.6 (2022): 725-740.');
    expect(r.year).toBe(2022);
    expect(r.title).toMatch(/^Exploring diversity through machine learning/);
    expect(r.journal).toBe('International Journal of Social Research Methodology');
  });
  it('Quoted conference title without parenthesised year', () => {
    const r = parseApaCitation('Raaper, R., Hardey, M., Aad, S., “Filling the gap: Student influencers as support providers in marketized higher education”, Studies in Higher education journal https://doi.org/10.1080/03075079.2024.2385614.');
    expect(r.title).toBe('Filling the gap: Student influencers as support providers in marketized higher education');
    expect(r.journal).toBe('Studies in Higher education journal');
    expect(r.doi).toBe('https://doi.org/10.1080/03075079.2024.2385614');
  });
  it('Title, Journal tail split and DOI with balanced parentheses', () => {
    const r = parseApaCitation('Haque MN, Beckers D, Costales E, Aad S, Sharifi A, Mora L (2025). A systematic review of research on just, equitable, responsible, and inclusive smart cities, Technology in Society https://doi.org/10.1016/j.techsoc.2025.103050');
    expect(r.title).toBe('A systematic review of research on just, equitable, responsible, and inclusive smart cities');
    expect(r.journal).toBe('Technology in Society');
    const d = parseApaCitation('Sater, F.A; Aad, S; Karkoulian, S, 2023. The impact of E-HRM practices, 15(1): 102-102. https://doi.org/10.35609/gcbssproceeding.2023.1(102)');
    expect(d.doi).toBe('https://doi.org/10.35609/gcbssproceeding.2023.1(102)');
  });
  it('question-mark subtitles stay in the title; unsplittable citations are flagged', () => {
    const r = parseApaCitation('Ismail, H. N. (2019). Which personal values matter most? Job performance and job satisfaction across job categories. International Journal of Organizational Analysis, 27(4), 1-10.');
    expect(r.title).toBe('Which personal values matter most? Job performance and job satisfaction across job categories');
    expect(parseApaCitation('Aad, S., Hardey, M. Title without year. Some Journal.').confident).toBe(false);
  });
  it('repairs DOCX split-word artefacts', () => {
    expect(repairSplitWords('R amadan, Z. (2025)')).toBe('Ramadan, Z. (2025)');
    expect(repairSplitWords('Technology in Societ y')).toBe('Technology in Society');
    expect(repairSplitWords('28 th Conference')).toBe('28th Conference');
    expect(repairSplitWords('A study of I and a b')).toBe('A study of I and a b');
  });
});
