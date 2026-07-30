!macro preserveLatestRevisionReaderBackup backupName
  ${If} ${FileExists} "$APPDATA\Revision Reader\backups\latest.json"
    CreateDirectory "$APPDATA\Revision Reader\backups\installer"
    Delete "$APPDATA\Revision Reader\backups\installer\latest.json"
    CopyFiles /SILENT "$APPDATA\Revision Reader\backups\latest.json" "$APPDATA\Revision Reader\backups\installer"
    Delete "$APPDATA\Revision Reader\backups\installer\${backupName}.json"
    Rename "$APPDATA\Revision Reader\backups\installer\latest.json" "$APPDATA\Revision Reader\backups\installer\${backupName}.json"
  ${EndIf}
!macroend

!macro customUnInstall
  ${if} ${isUpdated}
    !insertmacro preserveLatestRevisionReaderBackup "before-update"
  ${else}
    !insertmacro preserveLatestRevisionReaderBackup "before-uninstall"
  ${endIf}
!macroend
