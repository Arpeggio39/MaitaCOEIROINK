; Keep the uninstaller out of $INSTDIR while removing the installed app.
; /REBOOTOK lets Windows finish cleanup after reboot if a file is still locked.
!macro customRemoveFiles
  DetailPrint "Removing application files..."
  SetOutPath "$TEMP"
  RMDir /r /REBOOTOK "$INSTDIR"
!macroend
