# ============================================================
# RESPALDO DIARIO - Sistema de Administración de Restaurantes
# pg_dump (en Docker) -> carpeta local -> Google Drive
# Uso manual:  powershell -ExecutionPolicy Bypass -File db\backup.ps1
# ============================================================

# --- Configuración ---
 $CONTAINER  = "restaurante-db"
 $DB_USER    = "restaurante_admin"
 $DB_NAME    = "restaurante"
 $REMOTE     = "gdrive:RestauranteBackups"
 $BACKUP_DIR = "C:\proyectos\restaurante\db\backups"
 $LOG_DIR    = "$BACKUP_DIR\logs"
 $RETENCION_LOCAL = 7     # días de respaldos locales
 $RETENCION_DRIVE  = 30   # días de respaldos en Google Drive

# --- Preparación ---
 $FECHA    = Get-Date -Format "yyyyMMdd_HHmmss"
 $ARCHIVO  = "restaurante_$FECHA.dump"
 $LOG_FILE = "$LOG_DIR\backup_$FECHA.log"

New-Item -ItemType Directory -Force -Path $BACKUP_DIR | Out-Null
New-Item -ItemType Directory -Force -Path $LOG_DIR    | Out-Null

function Log($mensaje) {
    $linea = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - $mensaje"
    Write-Host $linea
    Add-Content -Path $LOG_FILE -Value $linea
}

Log "=== INICIO RESPALDO ==="

# --- 1. Verificar que el contenedor está corriendo ---
 $estado = docker inspect -f '{{.State.Status}}' $CONTAINER 2>$null
if ($estado -ne "running") {
    Log "ERROR: contenedor $CONTAINER no está corriendo (estado: $estado). Respaldo abortado."
    exit 1
}
Log "Contenedor $CONTAINER corriendo OK"

# --- 2. Generar dump DENTRO del contenedor (formato comprimido) ---
Log "Generando dump con pg_dump..."
docker exec $CONTAINER pg_dump -U $DB_USER -d $DB_NAME -Fc -f /tmp/$ARCHIVO
if ($LASTEXITCODE -ne 0) {
    Log "ERROR: pg_dump fallo (codigo $LASTEXITCODE). Respaldo abortado."
    exit 1
}

# --- 3. Traerlo a la carpeta local ---
docker cp "${CONTAINER}:/tmp/$ARCHIVO" "$BACKUP_DIR\$ARCHIVO"
if ($LASTEXITCODE -ne 0) {
    Log "ERROR: docker cp fallo. Respaldo abortado."
    exit 1
}
docker exec $CONTAINER rm /tmp/$ARCHIVO   # limpiar temporal del contenedor

 $tamano = [math]::Round((Get-Item "$BACKUP_DIR\$ARCHIVO").Length / 1KB, 1)
Log "Respaldo local OK: $ARCHIVO ($tamano KB)"

# --- 4. Subir a Google Drive (tolera falta de internet) ---
rclone copy "$BACKUP_DIR\$ARCHIVO" $REMOTE --log-file $LOG_FILE --log-level INFO
if ($LASTEXITCODE -ne 0) {
    Log "ADVERTENCIA: subida a Drive fallo (sin internet?). El respaldo LOCAL queda OK."
} else {
    Log "Respaldo subido a Google Drive OK"

    # --- 5. Rotación en Drive ---
    rclone delete $REMOTE --min-age "${RETENCION_DRIVE}d"
    Log "Rotacion en Drive completada (mantiene $RETENCION_DRIVE dias)"
}

# --- 6. Rotación local ---
Get-ChildItem -Path $BACKUP_DIR -Filter "restaurante_*.dump" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RETENCION_LOCAL) } |
    Remove-Item -Force
Log "Rotacion local completada (mantiene $RETENCION_LOCAL dias)"

Log "=== RESPALDO COMPLETADO ==="
