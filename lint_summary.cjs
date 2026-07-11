const data = JSON.parse(require('fs').readFileSync('eslint_report.json', 'utf8'))
const byRule = {}
const byFile = []
for (const f of data) {
  if (f.errorCount === 0) continue
  const rel = f.filePath.split('prose').pop().replace(/^[\\/]/, '')
  byFile.push([rel, f.errorCount])
  for (const m of f.messages) {
    if (m.severity !== 2) continue
    byRule[m.ruleId] = (byRule[m.ruleId] || 0) + 1
  }
}
console.log('BY RULE:')
Object.entries(byRule).sort((a, b) => b[1] - a[1]).forEach(([r, c]) => console.log(c, r))
console.log()
console.log('BY FILE (' + byFile.length + ' files):')
byFile.sort((a, b) => b[1] - a[1]).forEach(([f, c]) => console.log(c, f))
