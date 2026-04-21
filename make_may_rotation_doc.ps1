$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$tablePath = Join-Path $root 'may_rotation_table.tsv'
$notesPath = Join-Path $root 'may_rotation_notes.txt'
$outputPath = Join-Path $root 'may_rotation_draft.docx'

$utf8 = New-Object System.Text.UTF8Encoding($false)
$tableLines = [System.IO.File]::ReadAllLines($tablePath, $utf8)
$noteLines = [System.IO.File]::ReadAllLines($notesPath, $utf8)

$headers = $tableLines[0].Split("`t")
$rows = @()
for ($i = 1; $i -lt $tableLines.Length; $i++) {
    if ([string]::IsNullOrWhiteSpace($tableLines[$i])) { continue }
    $rows += ,($tableLines[$i].Split("`t"))
}

$title = $noteLines[0]
$subtitle = $noteLines[1]
$notes = @()
for ($i = 3; $i -lt $noteLines.Length; $i++) {
    if ([string]::IsNullOrWhiteSpace($noteLines[$i])) { continue }
    $notes += $noteLines[$i]
}

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0

try {
    $doc = $word.Documents.Add()
    $sel = $word.Selection

    $sel.Font.Size = 16
    $sel.Font.Bold = 1
    $sel.TypeText($title)
    $sel.TypeParagraph()
    $sel.Font.Size = 11
    $sel.Font.Bold = 0
    $sel.TypeText($subtitle)
    $sel.TypeParagraph()
    $sel.TypeParagraph()

    $table = $doc.Tables.Add($sel.Range, $rows.Count + 1, $headers.Count)
    $table.Borders.Enable = 1

    for ($col = 0; $col -lt $headers.Count; $col++) {
        $table.Cell(1, $col + 1).Range.Text = $headers[$col]
    }

    for ($row = 0; $row -lt $rows.Count; $row++) {
        for ($col = 0; $col -lt $rows[$row].Count; $col++) {
            $table.Cell($row + 2, $col + 1).Range.Text = $rows[$row][$col]
        }
    }

    $table.Rows.Item(1).Range.Bold = 1
    $table.AutoFitBehavior(2)

    $sel.EndKey(6) | Out-Null
    $sel.TypeParagraph()
    $sel.TypeParagraph()
    $sel.Font.Size = 13
    $sel.Font.Bold = 1
    $sel.TypeText('補足')
    $sel.TypeParagraph()
    $sel.Font.Size = 11
    $sel.Font.Bold = 0

    foreach ($note in $notes) {
        $sel.TypeText([char]0x30FB + $note)
        $sel.TypeParagraph()
    }

    $doc.SaveAs2($outputPath, 16)
    $doc.Close(0)
}
finally {
    $word.Quit()
}
