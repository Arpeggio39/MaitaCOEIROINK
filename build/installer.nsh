; electron-builder の atomicRMDir が失敗するとアンインストールが壊れるため、
; シンプルな削除処理に差し替える（アンインストール・更新の両方で実行される）
!macro customRemoveFiles
  DetailPrint "Removing application files..."
  RMDir /r $INSTDIR
!macroend
