/**
 * Parse Word XML (document.xml) and extract text preserving structure.
 */
export function parseWordXml(xml: string): string {
  const lines: string[] = [];

  const blocks = xml.match(/<w:tbl[ >][\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g) || [];

  for (const block of blocks) {
    if (block.startsWith('<w:tbl')) {
      const rows = block.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || [];
      for (const row of rows) {
        const cells = row.match(/<w:tc[ >][\s\S]*?<\/w:tc>/g) || [];
        const cellTexts = cells.map(cell => {
          // Split the cell into paragraphs: runs inside a paragraph must be
          // concatenated with NO separator (Word splits words across runs),
          // while separate paragraphs are joined with a space.
          const paras = cell.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) || [cell];
          return paras.map(para => {
            const tMatches = para.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || [];
            return tMatches.map(m => {
              const match = m.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/);
              return match ? match[1] : '';
            }).join('');
          }).join(' ').replace(/\s+/g, ' ').trim();
        });

        if (cellTexts.some(cell => cell.length > 0)) {
          lines.push(cellTexts.join(' | '));
        }
      }
      continue;
    }

    const textMatches = block.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || [];
    const texts = textMatches.map(m => {
      const match = m.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/);
      return match ? match[1] : '';
    });

    const line = texts.join('').trim();
    if (!line) continue;

    const styleMatch = block.match(/<w:pStyle\s+w:val="([^"]+)"/);
    const style = styleMatch ? styleMatch[1] : '';

    if (style.toLowerCase().includes('heading') || style.match(/^h\d$/i)) {
      lines.push(`\n## ${line}\n`);
    } else {
      lines.push(line);
    }
  }

  return lines.join('\n');
}

