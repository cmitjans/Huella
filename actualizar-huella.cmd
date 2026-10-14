@echo off
rem Actualiza Huella: baja la version mas reciente desde GitHub a esta misma carpeta.
set "HUELLA_CARPETA=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=Tls12; $w=New-Object Net.WebClient; $w.Encoding=[Text.Encoding]::UTF8; iex $w.DownloadString(https://raw.githubusercontent.com/cmitjans/Huella/main/herramientas/instalar.ps1)"
rem Abre la pagina de extensiones de Chrome para tocar recargar.
start "" chrome "chrome://extensions" 2>nul
echo.
pause
