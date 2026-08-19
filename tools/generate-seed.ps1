# 장수/전법 시드 마이그레이션 생성기.
#
# 이름은 반드시 이미지 파일명에서 읽는다. 손으로 옮겨 적으면 한글 오타가 나고,
# 그러면 asset_image.name 과 general.name / tactic.name 이 어긋나 이미지가 끊긴다.
#
# 세력(faction)과 코스트는 카드 이미지에서 판독한 값이며 아래 표에 고정해 둔다.
# 파일 목록과 표가 1:1 로 맞지 않으면 즉시 실패한다.

$ErrorActionPreference = 'Stop'

$assetRoot = 'C:\Users\chanha\OneDrive\Desktop\천하결전'
$outFile = 'd:\프로젝트\smaGukji\backend\src\main\resources\db\migration\V5__seed_generals_and_tactics.sql'

# 카드 이미지 좌상단 배지에서 판독한 세력
$factionByName = @{
    # 오 (WU) - 14
    '감녕' = 'WU'; '노숙' = 'WU'; '대교' = 'WU'; '서성' = 'WU'; '소교' = 'WU'
    '손견' = 'WU'; '손권' = 'WU'; '손상향' = 'WU'; '손책' = 'WU'; '여몽' = 'WU'
    '정보' = 'WU'; '주유' = 'WU'; '태사자' = 'WU'; '황개' = 'WU'
    # 위 (WEI) - 14
    '견희' = 'WEI'; '곽가' = 'WEI'; '등애' = 'WEI'; '서황' = 'WEI'; '순욱' = 'WEI'
    '우금' = 'WEI'; '장합' = 'WEI'; '전위' = 'WEI'; '정욱' = 'WEI'; '조인' = 'WEI'
    '조조' = 'WEI'; '하후돈' = 'WEI'; '하후연' = 'WEI'; '허저' = 'WEI'
    # 촉 (SHU) - 11
    '관우' = 'SHU'; '관평' = 'SHU'; '마초' = 'SHU'; '서서' = 'SHU'; '유비' = 'SHU'
    '장비' = 'SHU'; '제갈량' = 'SHU'; '조운' = 'SHU'; '주창' = 'SHU'; '황월영' = 'SHU'
    '황충' = 'SHU'
    # 군 (QUN) - 15
    '동탁' = 'QUN'; '문추' = 'QUN'; '방덕' = 'QUN'; '안량' = 'QUN'; '여포' = 'QUN'
    '원소' = 'QUN'; '이유' = 'QUN'; '장각' = 'QUN'; '장량' = 'QUN'; '장보' = 'QUN'
    '채문희' = 'QUN'; '초선' = 'QUN'; '추씨' = 'QUN'; '화웅' = 'QUN'; '화타' = 'QUN'
}

# 현재 데이터는 전원 코스트 5
$defaultCost = '5.0'

function Get-Names([string]$sub) {
    Get-ChildItem -File (Join-Path $assetRoot $sub) -Filter *.png |
        ForEach-Object { $_.BaseName.Normalize([Text.NormalizationForm]::FormC) } |
        Sort-Object
}

$generalNames = @(Get-Names '장수')
$tacticNames = @(Get-Names '전법')

# --- 검증: 파일 목록과 세력 표가 정확히 일치해야 한다 ---
$missingInMap = $generalNames | Where-Object { -not $factionByName.ContainsKey($_) }
$missingInFiles = $factionByName.Keys | Where-Object { $_ -notin $generalNames }

if ($missingInMap.Count -gt 0) {
    throw "세력 표에 없는 장수: $($missingInMap -join ', ')"
}
if ($missingInFiles.Count -gt 0) {
    throw "이미지 파일이 없는 장수: $($missingInFiles -join ', ')"
}

Write-Host "장수 $($generalNames.Count)명 / 전법 $($tacticNames.Count)개"
$factionByName.Values | Group-Object | Sort-Object Name | ForEach-Object {
    Write-Host ("  {0} : {1}명" -f $_.Name, $_.Count)
}

function Escape-Sql([string]$s) { $s.Replace("'", "''") }

$sb = [System.Text.StringBuilder]::new()
[void]$sb.AppendLine('-- 자동 생성 파일. 직접 수정하지 말고 tools/generate-seed.ps1 을 다시 실행하세요.')
[void]$sb.AppendLine('--')
[void]$sb.AppendLine('-- 이름은 카드 이미지 파일명에서 그대로 가져오므로 asset_image.name 과 항상 일치한다.')
[void]$sb.AppendLine('-- faction/cost 는 카드 이미지 판독값이고, 그 외 상세 수치는 미입력(NULL)이다.')
[void]$sb.AppendLine('')

[void]$sb.AppendLine('insert into general (name, faction, cost) values')
$rows = $generalNames | ForEach-Object {
    "    ('{0}', '{1}', {2})" -f (Escape-Sql $_), $factionByName[$_], $defaultCost
}
[void]$sb.AppendLine(($rows -join ",`n"))
[void]$sb.AppendLine('on conflict (name) do nothing;')
[void]$sb.AppendLine('')

[void]$sb.AppendLine('insert into tactic (name) values')
$rows = $tacticNames | ForEach-Object { "    ('{0}')" -f (Escape-Sql $_) }
[void]$sb.AppendLine(($rows -join ",`n"))
[void]$sb.AppendLine('on conflict (name) do nothing;')

# Flyway 는 UTF-8 로 읽는다. BOM 없이 쓴다.
[System.IO.File]::WriteAllText($outFile, $sb.ToString(), (New-Object System.Text.UTF8Encoding($false)))
Write-Host "생성 완료: $outFile"
