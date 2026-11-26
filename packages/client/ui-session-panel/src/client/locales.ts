/** `sessionPanel` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'sessionPanel'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'panel.name': '会话面板',
  'toggle.show': '显示会话面板',
  'toggle.hide': '隐藏会话面板',
  'toggle.unavailable': '切换到「对话」视图后可显示会话面板',
  'section.progress': '进度',
  'section.context': '上下文',
  'section.environment': '环境',
  'fold.expand': '展开 {count} 个',
  'fold.collapse': '收起',
  'progress.status.completed': '已完成',
  'progress.status.inProgress': '进行中',
  'progress.status.pending': '待处理',
  'project.label': '工作目录',
  'project.actions': '工作目录操作',
} as const

/** Every key of the `sessionPanel` namespace. */
export type SessionPanelKey = keyof typeof zh

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<SessionPanelKey, string> = {
  'panel.name': 'Session panel',
  'toggle.show': 'Show session panel',
  'toggle.hide': 'Hide session panel',
  'toggle.unavailable': 'Switch to the Chat view to show the session panel',
  'section.progress': 'Progress',
  'section.context': 'Context',
  'section.environment': 'Environment',
  'fold.expand': 'Show {count} more',
  'fold.collapse': 'Show less',
  'progress.status.completed': 'Completed',
  'progress.status.inProgress': 'In progress',
  'progress.status.pending': 'Pending',
  'project.label': 'Working folder',
  'project.actions': 'Working folder actions',
}

/** Japanese dictionary. */
export const ja = {
  'panel.name': 'セッションパネル',
  'toggle.show': 'セッションパネルを表示',
  'toggle.hide': 'セッションパネルを非表示',
  'toggle.unavailable': '「チャット」ビューに切り替えるとセッションパネルを表示できます',
  'section.progress': '進捗',
  'section.context': 'コンテキスト',
  'section.environment': '環境',
  'fold.expand': 'さらに {count} 件を表示',
  'fold.collapse': '折りたたむ',
  'progress.status.completed': '完了',
  'progress.status.inProgress': '進行中',
  'progress.status.pending': '保留中',
  'project.label': '作業フォルダー',
  'project.actions': '作業フォルダーの操作',
} satisfies Record<keyof typeof en, string>

/** Spanish dictionary. */
export const es = {
  'panel.name': 'Panel de la sesión',
  'toggle.show': 'Mostrar el panel de la sesión',
  'toggle.hide': 'Ocultar el panel de la sesión',
  'toggle.unavailable': 'Cambia a la vista Chat para mostrar el panel de la sesión',
  'section.progress': 'Progreso',
  'section.context': 'Contexto',
  'section.environment': 'Entorno',
  'fold.expand': 'Mostrar {count} más',
  'fold.collapse': 'Mostrar menos',
  'progress.status.completed': 'Completado',
  'progress.status.inProgress': 'En curso',
  'progress.status.pending': 'Pendiente',
  'project.label': 'Carpeta de trabajo',
  'project.actions': 'Acciones de la carpeta de trabajo',
} satisfies Record<keyof typeof en, string>

/** French dictionary. */
export const fr = {
  'panel.name': 'Panneau de session',
  'toggle.show': 'Afficher le panneau de session',
  'toggle.hide': 'Masquer le panneau de session',
  'toggle.unavailable': 'Passez à la vue Discussion pour afficher le panneau de session',
  'section.progress': 'Progression',
  'section.context': 'Contexte',
  'section.environment': 'Environnement',
  'fold.expand': 'Afficher {count} de plus',
  'fold.collapse': 'Réduire',
  'progress.status.completed': 'Terminé',
  'progress.status.inProgress': 'En cours',
  'progress.status.pending': 'En attente',
  'project.label': 'Dossier de travail',
  'project.actions': 'Actions sur le dossier de travail',
} satisfies Record<keyof typeof en, string>

/** German dictionary. */
export const de = {
  'panel.name': 'Sitzungsbereich',
  'toggle.show': 'Sitzungsbereich anzeigen',
  'toggle.hide': 'Sitzungsbereich ausblenden',
  'toggle.unavailable': 'Wechseln Sie zur Ansicht „Chat“, um den Sitzungsbereich anzuzeigen',
  'section.progress': 'Fortschritt',
  'section.context': 'Kontext',
  'section.environment': 'Umgebung',
  'fold.expand': '{count} weitere anzeigen',
  'fold.collapse': 'Weniger anzeigen',
  'progress.status.completed': 'Abgeschlossen',
  'progress.status.inProgress': 'In Bearbeitung',
  'progress.status.pending': 'Ausstehend',
  'project.label': 'Arbeitsordner',
  'project.actions': 'Aktionen für den Arbeitsordner',
} satisfies Record<keyof typeof en, string>

/** Russian dictionary. */
export const ru = {
  'panel.name': 'Панель сеанса',
  'toggle.show': 'Показать панель сеанса',
  'toggle.hide': 'Скрыть панель сеанса',
  'toggle.unavailable': 'Переключитесь на вид «Чат», чтобы показать панель сеанса',
  'section.progress': 'Прогресс',
  'section.context': 'Контекст',
  'section.environment': 'Среда',
  'fold.expand': 'Показать ещё {count}',
  'fold.collapse': 'Свернуть',
  'progress.status.completed': 'Завершено',
  'progress.status.inProgress': 'В процессе',
  'progress.status.pending': 'Ожидает',
  'project.label': 'Рабочая папка',
  'project.actions': 'Действия с рабочей папкой',
} satisfies Record<keyof typeof en, string>

/** Brazilian Portuguese dictionary. */
export const pt = {
  'panel.name': 'Painel da sessão',
  'toggle.show': 'Mostrar painel da sessão',
  'toggle.hide': 'Ocultar painel da sessão',
  'toggle.unavailable': 'Mude para a visualização Chat para mostrar o painel da sessão',
  'section.progress': 'Progresso',
  'section.context': 'Contexto',
  'section.environment': 'Ambiente',
  'fold.expand': 'Mostrar mais {count}',
  'fold.collapse': 'Mostrar menos',
  'progress.status.completed': 'Concluído',
  'progress.status.inProgress': 'Em andamento',
  'progress.status.pending': 'Pendente',
  'project.label': 'Pasta de trabalho',
  'project.actions': 'Ações da pasta de trabalho',
} satisfies Record<keyof typeof en, string>
