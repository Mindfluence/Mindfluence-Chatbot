Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json
Remove-Item package-lock.json -Force -ErrorAction SilentlyContinue
npm cache clean --force
npm install --no-fund --no-audit
npm run build

npm update

Remove-Item -Path node_modules -Recurse -Force
Remove-Item -Path .next -Recurse -Force
Remove-Item -Path dist -Recurse -Force # Falls vorhanden
Remove-Item -Path build -Recurse -Force # Falls vorhanden
Remove-Item -Path .eslintcache -Recurse -Force # Falls vorhanden

cd src  # Wechseln Sie in das src-Verzeichnis
tree /f > filetree.txt


# Erstelle Verzeichnisse
New-Item -Path "models\gpt2-small" -ItemType Directory -Force

# URLs der zu ladenden Dateien mit korrigiertem Link für merges.txt
$files = @(
    "https://huggingface.co/gpt2/resolve/main/config.json",
    "https://huggingface.co/gpt2/resolve/main/tokenizer_config.json",
    "https://huggingface.co/gpt2/resolve/main/vocab.json",
    "https://huggingface.co/gpt2/resolve/main/tokenizer.json",
    "https://huggingface.co/Xenova/gpt2-small/resolve/main/merges.txt",
    "https://huggingface.co/gpt2/resolve/main/special_tokens_map.json"
)

# Lade jede Datei herunter
foreach ($url in $files) {
    $filename = Split-Path -Path $url -Leaf
    $output = "models\gpt2-small\$filename"
    Write-Host "Lade $url nach $output herunter..."
    Invoke-WebRequest -Uri $url -OutFile $output -ErrorAction SilentlyContinue
    if (-not (Test-Path $output)) {
        Write-Warning "Konnte $filename nicht herunterladen. Versuche alternativen Link..."
    }
}

# Zusätzlich benötigen wir das ONNX-Modell
$modelUrl = "https://huggingface.co/Xenova/gpt2-small/resolve/main/model.onnx"
$modelOutput = "models\gpt2-small\model.onnx"
Write-Host "Lade ONNX-Modell herunter (dies kann einige Minuten dauern)..."
Invoke-WebRequest -Uri $modelUrl -OutFile $modelOutput -ErrorAction SilentlyContinue

Write-Host "Download abgeschlossen!"

npm run clear-onnx-cache
npm install
npm run dev