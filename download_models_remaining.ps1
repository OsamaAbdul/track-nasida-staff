
$baseUrl = "https://raw.githubusercontent.com/vladmandic/face-api/master/model/"
$models = @(
    "ssd_mobilenetv1_model-weights_manifest.json",
    "ssd_mobilenetv1_model-shard1"
)

$destDir = "public/models"
foreach ($model in $models) {
    # We want these to be named with the underscore if that's what face-api.js expects
    # In FaceCapture.tsx we use faceapi.nets.ssdMobilenetv1.loadFromUri('/models')
    # and face-api.js usually looks for 'ssd_mobilenet_v1_model-weights_manifest.json'
    
    $url = $baseUrl + $model
    $dest = Join-Path $destDir ($model.Replace("ssd_mobilenetv1", "ssd_mobilenet_v1"))
    Write-Host "Downloading $model as SSD Mobilenet V1..."
    try {
        Invoke-WebRequest -Uri $url -OutFile $dest -ErrorAction Stop
    } catch {
        Write-Host "Failed to download $model"
    }
}
