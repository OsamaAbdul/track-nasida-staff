
$baseUrl = "https://raw.githubusercontent.com/vladmandic/face-api/master/model/"
$models = @(
    "ssd_mobilenet_v1_model-weights_manifest.json",
    "ssd_mobilenet_v1_model-shard1",
    "face_landmark_68_model-weights_manifest.json",
    "face_landmark_68_model-shard1",
    "face_recognition_model-weights_manifest.json",
    "face_recognition_model-shard1"
)

$destDir = "public/models"
if (!(Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir }

foreach ($model in $models) {
    # Replace _model with nothing for vladmandic repo structure if needed
    # Actually let's check the filename
    $url = $baseUrl + $model
    $dest = Join-Path $destDir $model
    Write-Host "Downloading $model..."
    try {
        Invoke-WebRequest -Uri $url -OutFile $dest -ErrorAction Stop
    } catch {
        Write-Host "Failed to download $model from $url"
    }
}
