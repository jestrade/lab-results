/**
 * Spanish message catalog.
 *
 * Neutral (pan-regional) Spanish, for the reason `@/domain/locales` gives for
 * matching on the primary subtag only: one Spanish everyone can read beats a
 * regional one only some can. Where a term genuinely differs between Spain and
 * Latin America, the clinical register is preferred, since that is the
 * vocabulary already printed on the reports being uploaded.
 *
 * `ordenador`/`computadora` and similar are avoided rather than chosen.
 * `reporte` is used for a laboratory report throughout, never `reporte`.
 */

import type { Messages } from './messages';

export const es: Messages = {
  // ── Common ────────────────────────────────────────────────────────────
  'common.cancel': 'Cancelar',
  'common.save': 'Guardar',
  'common.saving': 'Guardando…',
  'common.saved': 'Guardado',
  'common.close': 'Cerrar',
  'common.loading': 'Cargando…',
  'common.retry': 'Reintentar',
  'common.back': 'Volver',
  'common.signOut': 'Cerrar sesión',
  'common.signIn': 'Iniciar sesión',
  'common.createAccount': 'Crear cuenta gratuita',
  'common.skipToContent': 'Ir al contenido',
  'common.dismissNotification': 'Descartar notificación',
  'common.verified': 'Verificado',
  'common.unverified': 'Sin verificar',
  'common.brandTagline': 'Archivo de resultados y tendencias',
  'common.somethingWentWrong': 'Algo ha fallado',
  'common.unexpectedError':
    'Ha ocurrido un error inesperado. Normalmente basta con recargar la página.',
  'common.reload': 'Recargar la página',
  'common.uploadReport': 'Subir un informe',

  // ── Language ──────────────────────────────────────────────────────────
  'lang.heading': 'Idioma',
  'lang.label': 'Idioma de la interfaz',
  'lang.description':
    'Cambia el idioma de la aplicación y, cuando existe traducción, el de los nombres y las explicaciones de las variables de laboratorio.',
  'lang.catalogNote':
    'Algunas explicaciones de variables solo están escritas en inglés por ahora. Esas se muestran en inglés en lugar de aparecer vacías.',
  'lang.switcherLabel': 'Idioma',
  'lang.saveFailed': 'Se cambió el idioma, pero no se pudo guardar en tu perfil.',

  // ── Appearance ────────────────────────────────────────────────────────
  'theme.heading': 'Apariencia',
  'theme.label': 'Tema',
  'theme.description':
    'Se aplica a toda tu cuenta, en cada dispositivo desde el que inicies sesión. Los resultados de laboratorio conservan los mismos colores para cada estado en ambos temas.',
  'theme.system': 'Ajuste del dispositivo',
  'theme.light': 'Claro',
  'theme.dark': 'Oscuro',
  'theme.followingSystemLight': 'Siguiendo tu dispositivo, que ahora está en modo claro.',
  'theme.followingSystemDark': 'Siguiendo tu dispositivo, que ahora está en modo oscuro.',
  'theme.saveFailed': 'Se cambió el tema, pero no se pudo guardar en tu perfil.',

  // ── Navigation ────────────────────────────────────────────────────────
  'nav.upload': 'Subir reporte',
  'nav.files': 'Archivos',
  'nav.variables': 'Inicio',
  'nav.account': 'Cuenta',
  'nav.profile': 'Perfil',
  'nav.settings': 'Configuración de la cuenta',
  'nav.administration': 'Administración',
  'nav.adminOverview': 'Resumen de administración',
  'nav.adminUsers': 'Usuarios',
  'nav.adminVariables': 'Catálogo de variables',
  'nav.adminJobs': 'Trabajos de procesamiento',
  'nav.main': 'Principal',
  'nav.navigation': 'Navegación',
  'nav.closeNavigation': 'Cerrar la navegación',

  // ── Public layout ─────────────────────────────────────────────────────
  'public.howItWorks': 'Cómo funciona',
  'public.privacy': 'Privacidad',
  'public.disclaimer': 'Aviso médico',
  'public.legal.privacy': 'Política de Privacidad',
  'public.legal.terms': 'Términos del Servicio',
  'public.legal.medicalDisclaimer': 'Aviso Médico',
  'public.legal.aiProcessing': 'Divulgación sobre el Procesamiento con IA',
  'public.legal.dataRetention': 'Conservación de Datos',

  // ── Auth layout ───────────────────────────────────────────────────────
  'authLayout.foot':
    'Solo con fines informativos y educativos. No es un producto sanitario ni sustituye la consulta con un profesional sanitario cualificado.',

  // ── Shared components ─────────────────────────────────────────────────
  'error.notConfigured': 'La aplicación no está configurada',
  'error.pageFailed':
    'No se ha podido mostrar la página. El problema ya se ha notificado. Normalmente basta con recargar; si no, escribe al soporte.',
  'disclaimer.bannerLabel': 'Aviso médico',
  'disclaimer.whatThisIsNot': 'Lo que esto no es',
  'disclaimer.readFull': 'Leer el aviso completo',
  'dropzone.release': 'Suelta el archivo para subirlo',
  'dropzone.unavailable': 'La subida todavía no está disponible',
  'dropzone.prompt': 'Arrastra aquí los PDF de tu laboratorio',
  'dropzone.hint': 'o elige archivos de tu equipo: solo PDF, hasta 25 MB cada uno',
  'password.show': 'Mostrar la contraseña',
  'password.hide': 'Ocultar la contraseña',
  'google.waiting': 'Esperando a Google…',
  'quota.used': '{label}: {percent} % utilizado',
  'quota.ofTotal': '{used} de {total}',
  'quota.full': 'Sin espacio. Elimina algún reporte que ya no necesites para liberar espacio.',
  'quota.remaining': 'Quedan {amount}',
  'skeleton.loadingResults': 'Cargando los resultados',

  // ── Status tables (@/domain/status) ───────────────────────────────────
  'status.result.normal': 'Normal',
  'status.result.normal.description':
    'Dentro del intervalo de referencia impreso en este reporte.',
  'status.result.low': 'Bajo',
  'status.result.low.description':
    'Por debajo del intervalo de referencia impreso en este reporte.',
  'status.result.high': 'Alto',
  'status.result.high.description':
    'Por encima del intervalo de referencia impreso en este reporte.',
  'status.result.critical': 'Crítico',
  'status.result.critical.description':
    'Fuera de los umbrales críticos indicados por el laboratorio. Puede requerir atención médica sin demora.',
  'status.result.unknown': 'Sin clasificar',
  'status.result.unknown.description':
    'Este reporte no incluía un intervalo de referencia utilizable, por lo que el valor no se ha clasificado.',

  'status.report.uploaded': 'Subido',
  'status.report.uploaded.description':
    'El archivo está guardado y a la espera de entrar en la cola de procesamiento.',
  'status.report.queued': 'En cola',
  'status.report.queued.description': 'A la espera de un turno de procesamiento.',
  'status.report.processing': 'Procesando',
  'status.report.processing.description': 'Se están extrayendo los resultados del reporte.',
  'status.report.processed': 'Procesado',
  'status.report.processed.description': 'Todos los resultados se han extraído correctamente.',
  'status.report.partiallyProcessed': 'Procesado parcialmente',
  'status.report.partiallyProcessed.description':
    'Se ha extraído la mayoría de los resultados; algunos valores no se han podido leer de forma fiable.',
  'status.report.failed': 'Fallido',
  'status.report.failed.description': 'No se ha podido procesar el reporte.',

  // Movimiento, nunca valoración: describen hacia dónde va el valor, sin
  // sugerir que eso sea bueno o malo.
  'status.trend.increasing': 'En aumento',
  'status.trend.increasing.description':
    'El valor ha subido a lo largo de los reportes recientes.',
  'status.trend.decreasing': 'En descenso',
  'status.trend.decreasing.description':
    'El valor ha bajado a lo largo de los reportes recientes.',
  'status.trend.stable': 'Estable',
  'status.trend.stable.description':
    'El valor no se ha movido de forma apreciable a lo largo de los reportes recientes.',
  'status.trend.insufficient': 'Datos insuficientes',
  'status.trend.insufficient.description':
    'Todavía no hay suficientes mediciones para describir una dirección.',

  'status.confidence.high': 'Confianza alta',
  'status.confidence.high.description': 'Este valor se ha leído con claridad del reporte.',
  'status.confidence.medium': 'Confianza media',
  'status.confidence.medium.description':
    'Este valor se ha leído con cierta incertidumbre. Compruébalo con el reporte.',
  'status.confidence.low': 'Confianza baja',
  'status.confidence.low.description':
    'Este valor no se ha podido leer de forma fiable. Compruébalo con el reporte original antes de darlo por bueno.',

  'range.general': 'referencia general, no específica del laboratorio',
  'range.unavailable': 'intervalo de referencia no disponible',

  // ── Variable series (@/domain/variables) ──────────────────────────────
  'series.range': 'Intervalo {range}',
  'series.rangeUnavailable': 'Intervalo de referencia no disponible',
  'series.resultOne': '{count} resultado',
  'series.resultMany': '{count} resultados',
  'sparkline.tooFew': '{name}: no hay mediciones suficientes para mostrar una tendencia.',
  'sparkline.rose': '{name} subió de {from} a {to} a lo largo de {count} mediciones.',
  'sparkline.fell': '{name} bajó de {from} a {to} a lo largo de {count} mediciones.',
  'sparkline.steady':
    '{name} apenas cambió, de {from} a {to}, a lo largo de {count} mediciones.',

  // ── Not found / coming soon ───────────────────────────────────────────
  'notFound.title': 'Esa página no existe',
  'notFound.body': 'Puede que el enlace esté anticuado o que la página haya cambiado de sitio.',
  'notFound.back': 'Volver al inicio',
  'comingSoon.title': 'Todavía sin construir',
  'comingSoon.body': '{description} Esta pantalla la construye {ticket}.',
  'comingSoon.adminOverviewBody':
    'Métricas de todo el sistema: usuarios, reportes, fallos y tiempo medio de procesamiento.',
  'comingSoon.adminJobsBody':
    'Trabajos de extracción en curso y fallidos, con sus duraciones y controles de reintento.',

  // ── Account settings ──────────────────────────────────────────────────
  'settings.aiHeading': 'Procesamiento con IA',
  'settings.agreed': 'Aceptado',
  'settings.notAgreed': 'Sin aceptar',
  'settings.aiIntro':
    'Para leer un reporte enviamos su texto a {provider}, un proveedor externo de inteligencia artificial. Antes se eliminan los identificadores que somos capaces de detectar: direcciones de correo, números de teléfono, números de historia clínica y fechas.',
  'settings.aiFact.notAnonymised':
    'Esto {emphasis}. Los nombres escritos dentro del documento no se pueden eliminar de forma fiable de manera automática.',
  'settings.aiFact.notAnonymisedEmphasis': 'no es una anonimización completa',
  'settings.aiFact.freeTier':
    'En el plan gratuito, las condiciones de Google permiten que el contenido enviado se utilice para mejorar sus productos.',
  'settings.aiFact.noPdf':
    'El PDF original nunca se envía: solo el texto extraído de él, ya redactado.',
  'settings.aiFact.calculated':
    'Que un resultado sea bajo, normal, alto o crítico se calcula a partir del intervalo impreso en tu reporte; no lo decide la IA.',
  'settings.fullDetail': 'Todos los detalles en la {document}.',
  'settings.agreedOn': 'Diste tu consentimiento el {date}.',
  'settings.withdraw': 'Retirar el consentimiento',
  'settings.blocked':
    'No se puede procesar ningún reporte hasta que lo aceptes. Puedes seguir sin subir nada, y los reportes ya procesados no se ven afectados.',
  'settings.agree': 'Lo entiendo y lo acepto',
  'settings.withdrawTitle': '¿Retirar el consentimiento para el procesamiento con IA?',
  'settings.keepIt': 'Mantenerlo',
  'settings.withdrawing': 'Retirando…',
  'settings.withdrawBody1':
    'Los reportes nuevos no se procesarán y no podrás subir ninguno hasta que vuelvas a aceptarlo. Desde el momento en que lo retires no se envía nada al proveedor de IA.',
  'settings.withdrawBody2':
    'Los reportes ya procesados conservan sus resultados. Retirar el consentimiento no elimina nada: para eliminar tus datos, {deleteLink}.',
  'settings.deleteAccountLink': 'elimina tu cuenta',
  'settings.otherHeading': 'Notificaciones y exportación de datos',
  'settings.otherBody':
    'Todavía sin construir: las notificaciones son KAN-48 y la exportación de datos es KAN-23 (spec §56). Tu nombre, tu contraseña y tu contexto de salud están en {profileLink}, y allí mismo puedes {deleteLink}.',
  'settings.profileLink': 'Perfil',
  'settings.deletingAccount': 'eliminar tu cuenta',

  // ── Reports list ──────────────────────────────────────────────────────
  'reports.loading': 'Cargando',
  'reports.countOne': '{count} reporte',
  'reports.countMany': '{count} reportes',
  'reports.resultsCount': '{count} resultados',
  'reports.filter.all': 'Todos',
  'reports.filterLabel': 'Filtrar los reportes por estado',
  'reports.emptyTitle': 'Todavía no hay reportes',
  'reports.emptyBody':
    'Sube tu primer PDF de laboratorio y extraeremos los resultados, los cruzaremos con los intervalos de referencia y empezaremos a seguir cada valor a lo largo del tiempo.',
  'reports.uploadFirst': 'Sube tu primer reporte',
  'reports.col.reportDate': 'Fecha del reporte',
  'reports.col.uploaded': 'Subido',
  'reports.col.file': 'Archivo original',
  'reports.col.status': 'Estado',
  'reports.col.results': 'Resultados',
  'reports.col.outOfRange': 'Fuera de intervalo',
  'reports.col.actions': 'Acciones',
  'reports.uploadDateNote': 'fecha de subida',
  'reports.retry': 'Reintentar',
  'reports.retrying': 'Reintentando…',
  'reports.retryLabel': 'Reintentar el procesamiento de {file}',
  'reports.viewDetails': 'Ver el detalle',
  'reports.viewDetailsLabel': 'Ver el detalle de {file}',
  'reports.originalPdf': 'PDF original',
  'reports.originalPdfLabel': 'Abrir el PDF original de {file}',
  'reports.delete': 'Eliminar',
  'reports.deleteLabel': 'Eliminar {file}',
  'reports.caption': 'Tus reportes de laboratorio',
  'reports.captionFiltered': 'Tus reportes de laboratorio, filtrados por {status}',
  'reports.noMatchTitle': 'Nada coincide con este filtro',
  'reports.noMatchBody': 'Ahora mismo ningún reporte tiene ese estado.',
  'reports.duplicateTag': 'Posible duplicado',
  'reports.deleteTitle': '¿Eliminar este reporte?',
  'reports.deletePermanently': 'Eliminar definitivamente',
  'reports.deleting': 'Eliminando…',
  'reports.deleteBody':
    'Se eliminarán {file} y todos los resultados extraídos de él. Esto no se puede deshacer, y los valores que aportaba desaparecerán de tus tendencias.',
  'reports.deleteFreed': 'Se liberarán {size} de tu almacenamiento.',
  'reports.loadFailed':
    'No hemos podido cargar tus reportes. Comprueba tu conexión e inténtalo de nuevo.',
  'reports.openFailed': 'No se ha podido abrir ese archivo. Puede que todavía se esté subiendo.',
  'reports.retryFailedAgain': 'Ese reporte tampoco se ha podido procesar esta vez.',
  'reports.retrySucceeded': 'El procesamiento ha terminado. Los resultados están listos.',
  'reports.deleted': 'Reporte eliminado. Se han liberado {size} de tu almacenamiento.',
  'reports.deleteFailed': 'No se ha podido eliminar ese reporte. Inténtalo de nuevo.',

  // ── Selección de varios reportes (KAN-43) ─────────────────────────────
  'reports.selectLabel': 'Seleccionar {file}',
  'reports.selectAllLabel': 'Seleccionar todos los reportes visibles',
  'reports.selectedOne': '{count} reporte seleccionado · {size}',
  'reports.selectedMany': '{count} reportes seleccionados · {size}',
  'reports.clearSelection': 'Quitar la selección',
  'reports.deleteSelected': 'Eliminar los seleccionados',
  'reports.deleteSelectedTitle': '¿Eliminar {count} reportes?',
  'reports.deleteSelectedConfirm': 'Eliminar {count} de forma permanente',
  'reports.deleteSelectedBody':
    'Se eliminarán estos reportes y los resultados extraídos de ellos. No se puede deshacer. Tus variables conservan los valores que estos reportes aportaron; para borrarlos, hazlo por separado desde la página de variables.',
  'reports.deletedOne': '{count} reporte eliminado. Se han liberado {size} de tu almacenamiento.',
  'reports.deletedMany':
    '{count} reportes eliminados. Se han liberado {size} de tu almacenamiento.',
  'reports.deleteSomeFailed':
    'No se han podido eliminar {count} y siguen seleccionados. Inténtalo de nuevo.',
  'reports.retryFailed':
    'No hemos podido reiniciar el procesamiento de este reporte. Inténtalo de nuevo dentro de unos minutos.',
  'reports.failedRetryable': 'El procesamiento ha fallado. Puedes volver a intentarlo.',
  'reports.failedReupload': 'El procesamiento ha fallado. Prueba a subir el archivo de nuevo.',
  'reports.extracting': 'Extrayendo los resultados…',
  'reports.pageOne': '{count} página',
  'reports.pageMany': '{count} páginas',

  // ── File and quota refusals ───────────────────────────────────────────
  'fileError.empty': '{file} está vacío. No se ha subido nada.',
  'fileError.notPdf':
    '{file} no es un PDF. Los reportes de laboratorio deben subirse como archivo PDF. No se ha subido nada.',
  'fileError.tooLarge': '{file} ocupa {size} y supera el límite de {limit}. No se ha subido nada.',
  'quotaError.uploadsDisabled':
    'Las subidas están pausadas mientras trabajamos en la capacidad. Tus reportes actuales no se ven afectados. Inténtalo de nuevo más tarde.',
  'quotaError.fileTooLarge':
    'Ese archivo ocupa {size} y supera el límite de {limit} por reporte. No se ha subido nada.',
  'quotaError.storageFull':
    'Este reporte necesita {needed} y solo te quedan {free} de tus {allowance}. Elimina algún reporte que ya no necesites y vuelve a intentarlo. No se ha subido nada.',
  'quotaError.uploadsExhausted':
    'Has agotado las {limit} subidas de este mes. Tu asignación se renueva el día 1. No se ha subido nada.',
  'quotaError.systemFull':
    'El servicio está al límite de capacidad y ahora mismo no puede aceptar reportes nuevos. No se ha subido nada: inténtalo más tarde o escribe al soporte.',

  'storageError.unauthorized':
    'El servidor ha rechazado esta subida. Suele deberse a un problema de configuración por nuestra parte y no a un problema con tu archivo. Escribe al soporte indicando la referencia de abajo. No se ha guardado nada.',
  'storageError.quotaExceeded':
    'No hay espacio de almacenamiento disponible para este reporte. Elimina algún reporte que ya no necesites y vuelve a intentarlo. No se ha guardado nada.',
  'storageError.unauthenticated':
    'Tu sesión ha caducado. Vuelve a iniciar sesión y reintenta la subida.',
  'storageError.retryLimit':
    'La subida ha agotado el tiempo de espera varias veces. Comprueba tu conexión e inténtalo de nuevo: no se ha guardado nada.',
  'storageError.canceled': 'Subida cancelada. No se ha guardado nada.',
  'storageError.invalidChecksum':
    'El archivo cambió mientras se subía. Inténtalo de nuevo sin editarlo: no se ha guardado nada.',
  'storageError.wrongSize':
    'La subida no ha llegado íntegra. Inténtalo de nuevo: no se ha guardado nada.',
  'storageError.unknown':
    'La subida no ha terminado. Inténtalo de nuevo y escribe al soporte si sigue ocurriendo. No se ha guardado nada.',
  'storageError.reference': '(referencia: {code})',

  // ── Upload page ───────────────────────────────────────────────────────
  'upload.kicker': 'Primer paso',
  'upload.lede':
    'Solo PDF, hasta {perFile} por reporte, dentro de tu asignación de {allowance}. Tu archivo se guarda de forma privada y se procesa en nuestros servidores; nunca se envía directamente desde tu navegador a un tercero.',
  'upload.allowanceLabel': 'Tu asignación de almacenamiento',
  'upload.storageUsed': 'Almacenamiento utilizado',
  'upload.uploadsThisMonth': 'Subidas de este mes',
  'upload.uploadsDetail': '{used} de {limit} utilizadas · se renueva el día 1',
  'upload.pausedTitle': 'Las subidas están pausadas',
  'upload.pausedBody':
    'El servicio está al límite de capacidad, así que ahora mismo no se pueden aceptar reportes nuevos. Tus reportes y resultados actuales no se ven afectados.',
  'upload.storageFullTitle': 'Tu almacenamiento está lleno',
  'upload.storageFullBody':
    'Elimina algún reporte que ya no necesites para liberar espacio. Estás utilizando {used} de {limit}.',
  'upload.storageLowTitle': 'Te queda poco espacio',
  'upload.storageLowBody':
    'Te quedan {remaining} de {limit}. Eliminar reportes que ya no necesites liberará espacio.',
  'upload.consentTitle': 'Antes de tu primera subida',
  'upload.consentBody1':
    'Para leer tu reporte enviamos su contenido a {provider}, un proveedor externo de inteligencia artificial. Antes se eliminan los identificadores que somos capaces de detectar (direcciones de correo, números de teléfono, números de historia clínica y fechas), pero esto no es una anonimización completa: {emphasis}.',
  'upload.consentEmphasis':
    'los nombres escritos dentro del documento no se pueden eliminar de forma fiable',
  'upload.consentBody2':
    'En el plan gratuito, las condiciones de Google permiten que el contenido enviado se utilice para mejorar sus productos. {link}.',
  'upload.consentLink': 'Qué se envía, en detalle',
  'upload.verifyTitle': 'Verifica tu correo antes de subir nada',
  'upload.verifyBody':
    'Para subir un reporte hace falta una dirección verificada. Te enviamos un enlace cuando creaste tu cuenta.',
  'upload.verifyAction': 'Verificar mi correo',
  'upload.disabled.verify': 'Verifica antes tu dirección de correo.',
  'upload.disabled.consent': 'Acepta el procesamiento con IA antes de subir nada.',
  'upload.disabled.capacity':
    'El servicio está al límite de capacidad. Inténtalo de nuevo más tarde.',
  'upload.disabled.storageFull':
    'Tu almacenamiento está lleno. Elimina algún reporte para liberar espacio.',
  'upload.disabled.monthly': 'Has agotado todas tus subidas de este mes.',
  'upload.cancelLabel': 'Cancelar la subida de {file}',
  'upload.removeLabel': 'Quitar {file} de la lista',
  'upload.progressLabel': 'Subiendo {file}',
  'upload.storedTitle': 'Reporte guardado',
  'upload.storedTitleMany': '{count} reportes guardados',
  'upload.storedBody':
    '{file} se ha subido correctamente. Puedes salir de esta página: el procesamiento continúa y tu reporte aparecerá en Reportes cuando termine.',
  'upload.storedBodyMany':
    'Los {count} reportes se han subido correctamente. Puedes salir de esta página: el procesamiento continúa y cada uno aparecerá en Reportes cuando termine.',
  'upload.goToFiles': 'Ir a los archivos',
  'upload.uploaded': 'Reporte subido. El procesamiento empieza automáticamente.',
  'upload.cancelled': 'Subida cancelada.',
  'upload.queueHeading': 'Tus archivos',
  'upload.queueLabel': 'Archivos elegidos para subir',
  'upload.queueCount': '{done} de {total} subidos',
  'upload.clearFinished': 'Limpiar los terminados',
  'upload.state.checking': 'Comprobando si este reporte ya está en tu cuenta…',
  'upload.state.confirming': 'A la espera de tu respuesta.',
  'upload.state.waiting': 'Esperando su turno: los archivos se suben de uno en uno.',
  'upload.state.uploading': 'Subiendo.',
  'upload.state.stored': 'Subido. El procesamiento empieza automáticamente.',
  'upload.state.skipped':
    'No se ha subido: has preferido conservar la copia que ya tenías ({file}).',
  'upload.state.cancelled': 'Cancelado. No se ha guardado nada.',
  'upload.duplicateTitle': 'Puede que este reporte ya exista',
  'upload.duplicateBody': '{file} se parece a un reporte que ya está en tu cuenta.',
  'upload.duplicateIdentical': 'Es el mismo archivo, byte a byte, que el reporte de abajo.',
  'upload.duplicateSimilar':
    'Tiene el mismo nombre y el mismo tamaño que el reporte de abajo, lo que suele significar que es el mismo archivo descargado dos veces.',
  'upload.duplicateQuestion': '¿Quieres continuar y subirlo de todos modos?',
  'upload.duplicateContinue': 'Subirlo igualmente',
  'upload.duplicateSkip': 'No subirlo',
  'upload.statusHeading': 'Estado del procesamiento',
  'upload.statusLabel': 'Progreso del procesamiento del reporte',
  'upload.statusFoot':
    'Puedes salir de esta página: el procesamiento continúa y tu reporte aparecerá en Reportes cuando termine.',
  'upload.step.stored': '{size} guardados',
  'upload.step.transferring': 'Quedan {count}',
  'upload.step.chooseFile': 'Elige un PDF para empezar',
  'upload.step.waitingSlot': 'A la espera de un turno de procesamiento',
  'upload.step.extracting': 'Extrayendo los resultados',
  'upload.step.ready': 'Resultados y explicaciones listos',

  // ── Report details ────────────────────────────────────────────────────
  'detail.loadFailed': 'No hemos podido cargar este reporte. Puede que se haya eliminado.',
  'detail.resultsLoadFailed': 'No hemos podido cargar los resultados de este reporte.',
  'detail.openFailed': 'No se ha podido abrir ese archivo.',
  'detail.missingTitle': 'Ese reporte no existe',
  'detail.missingBody': 'Puede que se haya eliminado o que el enlace sea incorrecto.',
  'detail.backToFiles': 'Volver a los archivos',
  'detail.reprocessing': 'Reprocesando…',
  'detail.tryAgain': 'Intentar procesarlo de nuevo',
  'detail.reportOf': 'Reporte del {date}',
  'detail.downloadOriginal': 'Descargar el original',
  'detail.criticalOne': '{count} resultado fuera del intervalo crítico',
  'detail.criticalMany': '{count} resultados fuera del intervalo crítico',
  'detail.partialTitle': 'Algunos valores no se han podido leer',
  'detail.failedTitle': 'Este reporte no se ha podido procesar',
  'detail.failedFallback': 'Algo ha fallado al procesar este reporte.',
  'detail.processingTitle': 'Todavía procesando',
  'detail.processingBody':
    'Los resultados aparecerán aquí en cuanto termine la extracción. Puedes salir de esta página.',
  'detail.extractedResults': 'Resultados extraídos',
  'detail.summaryOne': '{count} resultado',
  'detail.summaryMany': '{count} resultados',
  'detail.summaryOutOfRange': '{count} fuera de intervalo',
  'detail.summaryLowConfidence': '{count} con confianza baja',
  'detail.noResultsTitle': 'Todavía no hay resultados',
  'detail.stillExtracting': 'La extracción sigue en curso.',
  'detail.nothingExtracted': 'No se ha extraído nada de este reporte.',
  'detail.tableCaption': 'Resultados extraídos de {file}',
  'detail.col.test': 'Prueba',
  'detail.col.value': 'Valor',
  'detail.col.unit': 'Unidad',
  'detail.col.range': 'Intervalo de referencia',
  'detail.col.status': 'Estado',
  'detail.notStated': 'No indicado',
  'detail.aiGenerated': 'Generado por IA · no es asesoramiento médico',
  'detail.promptVersion': '{model} · prompt {version}',
  'detail.duplicateTitle': 'Esto se parece a un reporte que ya tienes',
  'detail.duplicateBody':
    'Otro reporte de tu cuenta tiene la misma fecha, el mismo laboratorio o los mismos resultados. Se han conservado los dos: no se ha eliminado ni fusionado nada. Compáralos y elimina el que no quieras.',
  'detail.duplicateCompare': 'Abrir el otro reporte',
  'detail.metaLabel': 'Metadatos del reporte',
  'detail.meta.laboratory': 'Laboratorio',
  'detail.meta.notStated': 'No consta en este reporte',
  'detail.meta.reportDate': 'Fecha del reporte',
  'detail.meta.uploaded': 'Subido',
  'detail.meta.processed': 'Procesado',
  'detail.meta.file': 'Archivo',
  'detail.meta.fileValue': '{name} · {size}',
  'detail.meta.privateLink':
    'El archivo original se sirve mediante un enlace autenticado. Nunca se le asigna una URL pública.',

  // ── Variables ─────────────────────────────────────────────────────────
  'variables.loadFailed':
    'No hemos podido cargar tus variables. Comprueba tu conexión e inténtalo de nuevo.',
  'variables.trackedOne': '{count} variable en seguimiento',
  'variables.trackedMany': '{count} variables en seguimiento',
  'variables.search': 'Buscar',
  'variables.searchPlaceholder': 'Busca una prueba o un alias',
  'variables.loadingLabel': 'Cargando las variables',
  'variables.emptyTitle': 'Todavía no hay variables en seguimiento',
  'variables.emptyBody':
    'Cuando se haya procesado un reporte, cada prueba que contenga aparecerá aquí con su último valor y con cómo se ha movido a lo largo del tiempo.',
  'variables.filterCategory': 'Filtrar por categoría',
  'variables.allCategories': 'Todas las categorías',
  'variables.outOfRangeOnly': 'Solo fuera de intervalo ({count})',
  'variables.sortBy': 'Orden',
  'variables.sort.category': 'Por panel',
  'variables.sort.recent': 'Más recientes primero',
  'variables.sort.flagged': 'Fuera de intervalo primero',
  'variables.noMatchTitle': 'Nada coincide',
  'variables.noMatchBody': 'Ninguna variable en seguimiento coincide con esos filtros.',
  'variables.groupCountOne': '{count} variable',
  'variables.groupCountMany': '{count} variables',
  'variables.showing': 'Mostrando {visible} de {total} variables.',
  'variables.cardLabel': '{name}, {value}',
  'variables.clearIntro':
    'Los valores de esta página se guardan como un historial por prueba, construido a partir de todos los reportes procesados. Al eliminar un reporte se borra el archivo, no lo que aportó a ese historial: esto borra el historial en sí.',
  'variables.clearButton': 'Borrar los datos de las variables',
  'variables.clearTitle': '¿Borrar todos los datos de las variables?',
  'variables.clearBody':
    'Se eliminarán las {count} variables en seguimiento y todas las mediciones que hay detrás. {emphasis}',
  'variables.clearBodyEmphasis': 'No se puede deshacer.',
  'variables.clearKeeps':
    'Tus reportes y los resultados de cada uno de ellos no se tocan. Esta página se volverá a llenar a medida que se procesen nuevos reportes.',
  'variables.clearCancel': 'Conservarlos',
  'variables.clearConfirm': 'Borrarlo todo',
  'variables.clearing': 'Borrando…',
  'variables.clearedOne': 'Se ha borrado {count} variable.',
  'variables.clearedMany': 'Se han borrado {count} variables.',
  'variables.clearFailed':
    'No se han podido borrar los datos de tus variables. Inténtalo de nuevo.',

  // ── Gráfico del historial (en la página de la variable) ───────────────
  'period.label': 'Periodo',
  'period.12m': 'Últimos 12 meses',
  'period.3y': 'Últimos 3 años',
  'period.all': 'Todo el historial',
  'variable.chartNote':
    'El gráfico conserva la escala propia de esta prueba y el intervalo de referencia impreso en cada informe, de modo que los valores siguen siendo los que informó tu laboratorio. Una dirección describe el movimiento a lo largo del tiempo; no es un juicio sobre tu salud.',
  'variable.tooFewOne':
    '{count} medición por ahora. Para indicar una dirección hacen falta al menos {min}, así que no se muestra ninguna; las mediciones sí se representan.',
  'variable.tooFewMany':
    '{count} mediciones por ahora. Para indicar una dirección hacen falta al menos {min}, así que no se muestra ninguna; las mediciones sí se representan.',

  // ── Trend chart ───────────────────────────────────────────────────────
  'chart.noMeasurements': 'No hay mediciones en este periodo.',
  'chart.summaryOne':
    '{name}: {count} medición, del {firstDate} al {lastDate}, de {firstValue} a {lastValue}. Intervalo de referencia {range}.',
  'chart.summaryMany':
    '{name}: {count} mediciones, del {firstDate} al {lastDate}, de {firstValue} a {lastValue}. Intervalo de referencia {range}.',
  'chart.rangeNotStated': 'no indicado en el reporte',

  // ── Detalle de la variable (KAN-14 / KAN-46) ──────────────────────────
  'variable.loadFailed':
    'No hemos podido cargar esta variable. Comprueba tu conexión e inténtalo de nuevo.',
  'variable.historyFailed':
    'No hemos podido leer las mediciones de esta variable. Lo que se muestra arriba sigue procediendo de tus reportes; el historial de abajo está incompleto.',
  'variable.missingTitle': 'No hay seguimiento de esta prueba',
  'variable.missingBody':
    'Puede que el enlace esté anticuado o que esta variable se haya borrado. Sube un reporte que incluya esta prueba y aparecerá aquí.',
  'variable.backToVariables': 'Volver a las variables',
  'variable.currentHeading': 'Último resultado',
  'variable.lastMeasured': 'Medido el {date}',
  'variable.categoryLabel': 'Panel',
  'variable.measuredLabel': 'Historial',
  'variable.measuredOne': '{count} medición',
  'variable.measuredMany': '{count} mediciones',
  'variable.historyHeading': 'A lo largo del tiempo',
  // Solo movimiento: «sube» y «baja» describen los números, y nada de esto
  // puede dar a entender que una dirección sea buena o mala.
  'variable.changeNone': 'Todavía no hay mediciones de {name}.',
  'variable.changeFirst':
    'Último {name}: {value}. Es la primera medición, así que aún no hay con qué compararla.',
  'variable.changeUp':
    'Último {name}: {value}, por encima de {previous} en la medición anterior.',
  'variable.changeDown':
    'Último {name}: {value}, por debajo de {previous} en la medición anterior.',
  'variable.changeSame':
    'Último {name}: {value}, igual que {previous} en la medición anterior.',
  'variable.showRange': 'Intervalo de referencia',
  'variable.noNumeric':
    'Ninguno de estos resultados es un número, así que no hay nada que representar. Se listan abajo tal como los escribió el laboratorio.',
  'variable.historyTruncated':
    'Compuesto a partir de tus {count} reportes procesados más recientes. Lo anterior a ellos no se incluye aquí.',
  'variable.qualitativeHeading': 'Valores informados',
  'variable.qualitativeBody':
    'Estos resultados no eran números. Se muestran tal como los escribió el laboratorio, porque convertir «Negativo» en una cifra afirmaría algo que el reporte nunca dijo.',
  'variable.explanationHeading': 'Qué mide esta prueba',
  'variable.explanationMissing': 'Todavía no se ha escrito una explicación de esta prueba.',
  'variable.explanationUnreviewed':
    'Redactada automáticamente a partir del nombre impreso en un reporte, sin revisión de una persona.',
  'variable.aliases': 'También impreso como {names}',
  'variable.analysisHeading': 'Análisis de tu último resultado',
  'variable.analysisOf': 'Redactado para el resultado del {date}',
  'variable.analysisMissing':
    'No se ha generado ningún análisis de esta prueba. Solo se redacta para resultados fuera de su intervalo de referencia, y únicamente si has aceptado el procesamiento con IA.',
  'variable.tableHeading': 'Todas las mediciones',
  'variable.tableEmpty': 'No se han encontrado mediciones de esta prueba en tus reportes.',
  'variable.tableCaption': 'Todas las mediciones de {name} en tus reportes',
  'variable.col.date': 'Fecha',
  'variable.col.report': 'Reporte',
  'variable.openReport': 'Abrir el reporte',

  // ── Gráfico interactivo de la variable ────────────────────────────────
  'variableChart.pointLabel':
    '{name} el {date}: {value}, {status}. Actívalo para ver el reporte del que procede.',
  'variableChart.zoomHint':
    'Arrastra sobre el gráfico para acotar el periodo. Los botones de periodo de arriba hacen lo mismo sin ratón.',
  'variableChart.resetZoom': 'Restablecer el zoom',
  'variableChart.openReport': 'Abrir el reporte',
  'variableChart.rangeOnReport': 'Intervalo en este reporte {range}',
  'variableChart.noRangeOnReport': 'Este reporte no indicaba ningún intervalo de referencia',

  // ── Auth errors (@/auth/authErrors) ───────────────────────────────────
  'authError.invalidCredential':
    'Ese correo y esa contraseña no coinciden. Compruébalos e inténtalo de nuevo, o restablece tu contraseña.',
  'authError.invalidEmail':
    'Eso no parece una dirección de correo. Compruébala e inténtalo de nuevo.',
  'authError.userDisabled':
    'Esta cuenta se ha desactivado. Escribe al soporte si crees que es un error.',
  'authError.emailInUse':
    'Ya existe una cuenta con esta dirección de correo. Inicia sesión, o restablece tu contraseña si la has olvidado.',
  'authError.differentCredential':
    'Este correo ya tiene una cuenta con contraseña. Inicia sesión con tu contraseña una vez y enlazaremos tu cuenta de Google con ella.',
  'authError.credentialInUse':
    'Esa cuenta de Google ya está enlazada con otra cuenta de LabResults.',
  'authError.weakPassword':
    'Esa contraseña es demasiado fácil de adivinar. Usa al menos 10 caracteres.',
  'authError.tooManyRequests':
    'Demasiados intentos desde este dispositivo. Espera unos minutos antes de volver a intentarlo, o restablece tu contraseña.',
  'authError.network':
    'No hemos podido conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.',
  'authError.popupClosed':
    'La ventana de inicio de sesión de Google se cerró antes de terminar. Inténtalo de nuevo cuando quieras.',
  'authError.popupBlocked':
    'Tu navegador ha bloqueado la ventana de inicio de sesión de Google. Permite las ventanas emergentes en este sitio, o inicia sesión con tu correo y tu contraseña.',
  'authError.notAllowed':
    'Ese método de inicio de sesión no está habilitado en esta aplicación. Escribe al soporte.',
  'authError.unauthorizedDomain':
    'No se permite iniciar sesión desde esta dirección. Escribe al soporte.',
  'authError.storageBlocked':
    'Tu navegador está bloqueando el almacenamiento que necesita este inicio de sesión. Permite las cookies y los datos de sitio aquí, o inicia sesión con tu correo y tu contraseña.',
  'authError.internal':
    'No se ha podido completar el inicio de sesión. Inténtalo de nuevo, o inicia sesión con tu correo y tu contraseña.',
  'authError.timeout': 'El inicio de sesión ha tardado demasiado en responder. Inténtalo de nuevo.',
  'authError.cancelled':
    'El inicio de sesión se canceló antes de terminar. Inténtalo de nuevo cuando quieras.',
  'authError.recentLogin': 'Por seguridad, vuelve a iniciar sesión antes de hacer este cambio.',
  'authError.expiredCode':
    'Ese enlace ha caducado. Solicita uno nuevo y úsalo antes de que pase una hora.',
  'authError.invalidCode':
    'Ese enlace ya no es válido; puede que ya se haya utilizado. Solicita uno nuevo.',
  'authError.generic':
    'Algo ha fallado al iniciar tu sesión. Inténtalo de nuevo y escribe al soporte si sigue ocurriendo.',
  'authError.reference': '(referencia: {code})',

  // ── Password strength ─────────────────────────────────────────────────
  'password.tooShort': 'Usa al menos {min} caracteres.',
  'password.advice0': 'Al menos {min} caracteres.',
  'password.advice1': 'Demasiado corta. Usa al menos {min} caracteres.',
  'password.advice2': 'Al menos {min} caracteres. Añade un número o un símbolo para reforzarla.',
  'password.advice3': 'Bien. Añade un símbolo para reforzarla todavía más.',
  'password.advice4': 'Segura.',

  // ── Profile ───────────────────────────────────────────────────────────
  'profile.loadFailed':
    'No hemos podido cargar tu perfil. Comprueba tu conexión e inténtalo de nuevo.',
  'profile.detailsHeading': 'Tus datos',
  'profile.displayName': 'Nombre visible',
  'profile.nameEmpty': 'Tu nombre no puede estar vacío.',
  'profile.emailAddress': 'Dirección de correo',
  'profile.emailHint':
    'Todavía no se puede cambiar el correo: hace falta un flujo de cambio verificado para que una cuenta no pueda trasladarse a una dirección que su titular no controle.',
  'profile.saveName': 'Guardar el nombre',
  'profile.nameSaved': 'Nombre guardado.',
  'profile.emailVerification': 'Verificación del correo',
  'profile.notVerified': 'Sin verificar',
  'profile.resendVerification': 'Reenviar el correo de verificación',
  'profile.resent': 'Enviado: revisa tu bandeja de entrada.',
  'profile.accountCreated': 'Cuenta creada',
  'profile.passwordHeading': 'Contraseña',
  'profile.googleNoPassword':
    'Inicias sesión con Google, así que esta cuenta no tiene aquí ninguna contraseña. Puedes gestionarla en la {link}.',
  'profile.googleSettingsLink': 'configuración de tu cuenta de Google',
  'profile.passwordMismatch': 'Las dos contraseñas nuevas no coinciden.',
  'profile.passwordIntro':
    'Hace falta tu contraseña actual. Sin ella, cualquiera que encontrase esta sesión abierta podría dejarte fuera de tus propios registros.',
  'profile.passwordChanged': 'Tu contraseña se ha cambiado.',
  'profile.currentPassword': 'Contraseña actual',
  'profile.newPassword': 'Contraseña nueva',
  'profile.confirmPassword': 'Confirmar la contraseña nueva',
  'profile.changing': 'Cambiando…',
  'profile.changePassword': 'Cambiar la contraseña',
  'profile.contextHeading': 'Sobre ti',
  'profile.optional': 'Opcional',
  'profile.contextIntro':
    'Los intervalos de referencia varían según la edad y el sexo, y saber qué tomas o con qué convives hace que una explicación sea más pertinente. Todos los campos son opcionales, y dejarlos en blanco no cambia nada en cómo se clasifican tus resultados.',
  'profile.contextLimit':
    'Rellenar esto no convierte el análisis en una valoración médica. Nada de lo que pongas aquí se usa para decidir si un resultado es normal: eso siempre se calcula a partir del intervalo de referencia impreso en tu propio reporte.',
  'profile.contextUnusedEmphasis': 'Todavía no se usa para el análisis.',
  'profile.contextUnused':
    '{emphasis} Esto se guarda en tu cuenta, pero el análisis con IA no lo lee. Enviarlo ampliaría lo que sale de esta aplicación más allá de lo que describe hoy el consentimiento de procesamiento con IA, así que antes hay que actualizar ese texto.',
  'profile.saveFailed': 'No hemos podido guardar esto. Comprueba tu conexión e inténtalo de nuevo.',
  'profile.removeFailed':
    'No hemos podido eliminar esto. Comprueba tu conexión e inténtalo de nuevo.',
  'profile.dateOfBirth': 'Fecha de nacimiento',
  'profile.dateOfBirthHint': 'Se usa para calcular tu edad en el momento de cada reporte.',
  'profile.biologicalSex': 'Sexo biológico',
  'profile.biologicalSexHint':
    'Se pregunta porque muchos intervalos de referencia varían según el sexo.',
  'profile.preferNotToSay': 'Prefiero no decirlo',
  'profile.sex.female': 'Mujer',
  'profile.sex.male': 'Hombre',
  'profile.sex.intersex': 'Intersexual',
  'profile.pregnancyStatus': 'Estado de embarazo',
  'profile.pregnancy.not': 'No embarazada',
  'profile.pregnancy.pregnant': 'Embarazada',
  'profile.pregnancy.postpartum': 'Posparto',
  'profile.medications': 'Medicación',
  'profile.medicationsHint': 'Una por línea. Se guarda tal como la escribas; nunca se interpreta.',
  'profile.conditions': 'Enfermedades o condiciones',
  'profile.onePerLine': 'Una por línea.',
  'profile.symptoms': 'Síntomas actuales',
  'profile.removeAll': 'Eliminar todo esto',
  'profile.removeTitle': '¿Eliminar todo lo de esta sección?',
  'profile.removing': 'Eliminando…',
  'profile.removeIt': 'Eliminarlo',
  'profile.removeBody':
    'Se eliminarán de tu cuenta tu fecha de nacimiento, tu sexo, tu estado de embarazo, tu medicación, tus condiciones y tus síntomas. Tus reportes y tus resultados no se ven afectados.',

  // ── Account deletion ──────────────────────────────────────────────────
  'profile.dataHeading': 'Tus datos',
  'profile.consentElsewhere':
    'La privacidad y el consentimiento de procesamiento con IA están en {link}.',
  'profile.exportEmphasis': 'La exportación de datos todavía no está construida',
  'profile.exportBody':
    '{emphasis} (KAN-23). Escríbenos si necesitas una copia de tus reportes antes de eliminar tu cuenta: la eliminación no se puede deshacer.',
  'profile.deleted.profile':
    'Tu perfil: nombre, correo y todo lo que hayas rellenado en «Sobre ti».',
  'profile.deleted.reports': 'Todos los reportes que hayas subido, incluidos los PDF originales.',
  'profile.deleted.results':
    'Todos los valores extraídos de esos reportes y las explicaciones de la IA sobre ellos.',
  'profile.deleted.variables': 'Tus variables en seguimiento y su historial.',
  'profile.deleted.account': 'Tu registro de consentimiento y tu propio acceso.',
  'profile.deleteHeading': 'Eliminar tu cuenta',
  'profile.deleteIntro':
    'Esto elimina tu cuenta y todo lo que contiene, de forma permanente. No se conserva nada, y no podemos recuperarlo.',
  'profile.deleteButton': 'Eliminar mi cuenta',
  'profile.deleteTitle': '¿Eliminar tu cuenta y todos tus datos?',
  'profile.keepAccount': 'Conservar mi cuenta',
  'profile.deleting': 'Eliminando…',
  'profile.deleteEverything': 'Eliminarlo todo',
  'profile.deleteWarningEmphasis': 'Esto no se puede deshacer.',
  'profile.deleteWarning':
    '{emphasis} Tus reportes, tus resultados, su historial y tu acceso se borran de nuestra base de datos y de nuestro almacenamiento de archivos. No hay ninguna copia de seguridad desde la que podamos restaurarte.',
  'profile.yourPassword': 'Tu contraseña',
  'profile.yourPasswordHint':
    'Se pide para que quien encuentre esta página abierta no pueda eliminar tus registros.',
  'profile.googleReauth':
    'Esta cuenta inicia sesión con Google, así que se abrirá una ventana de Google para confirmar que eres tú antes de eliminar nada.',
  'profile.typeToConfirm': 'Escribe {word} para confirmar',
  'profile.deletedToast': 'Tu cuenta y todos tus datos se han eliminado.',
  'profile.deleteReauth': 'Por seguridad, vuelve a iniciar sesión y elimina después tu cuenta.',
  'profile.deleteExpired':
    'Tu sesión ha caducado. Vuelve a iniciar sesión y elimina después tu cuenta.',
  'profile.deletePartial':
    'No hemos podido terminar de eliminar tu cuenta. Puede que parte de tus datos ya se haya eliminado; vuelve a intentarlo y se eliminará el resto. Escríbenos si sigue fallando.',

  // ── Sign in ───────────────────────────────────────────────────────────
  'signIn.asideHeading': 'Tus resultados de laboratorio, por fin en un solo sitio.',
  'signIn.aside.uploadTitle': 'Sube un PDF',
  'signIn.aside.uploadBody':
    'Extraemos por ti el nombre, el valor, la unidad y el intervalo de referencia de cada prueba.',
  'signIn.aside.trackTitle': 'Sigue cada valor a lo largo del tiempo',
  'signIn.aside.trackBody':
    'La misma prueba de distintos laboratorios, emparejada y representada en un mismo gráfico.',
  'signIn.aside.contextTitle': 'Contexto en lenguaje llano',
  'signIn.aside.contextBody':
    'Explicaciones y análisis, siempre identificados como generados por IA.',
  'signIn.newHere': '¿Es tu primera vez? {link}',
  'signIn.createAccountLink': 'Crea una cuenta',
  'signIn.continueWithGoogle': 'Continuar con Google',
  'signIn.orEmail': 'o inicia sesión con tu correo',
  'signIn.email': 'Dirección de correo',
  'signIn.password': 'Contraseña',
  'signIn.forgotPassword': '¿Has olvidado la contraseña?',
  'signIn.keepSignedIn': 'Mantener la sesión iniciada en este dispositivo',
  'signIn.signingIn': 'Iniciando sesión…',
  'signIn.legal': 'Al iniciar sesión aceptas los {terms}, la {privacy} y la {ai}.',

  // ── Register ──────────────────────────────────────────────────────────
  'register.asideHeading': 'Una sola cuenta. Todas las analíticas que te has hecho.',
  'register.asideLede':
    'Tus reportes y los valores extraídos de ellos solo los ves tú. Los archivos se guardan de forma privada y se procesan en nuestros servidores; el PDF original nunca recibe un enlace público.',
  'register.heading': 'Crea tu cuenta',
  'register.haveOne': '¿Ya tienes una? {link}',
  'register.signUpWithGoogle': 'Registrarse con Google',
  'register.orEmail': 'o usa tu correo',
  'register.fullName': 'Nombre completo',
  'register.namePlaceholder': 'Miriam Okonkwo',
  'register.emailPlaceholder': 'tu@ejemplo.com',
  'register.nameRequired': 'Escribe el nombre con el que quieres que nos dirijamos a ti.',
  'register.emailInvalid': 'Escribe una dirección de correo válida.',
  'register.consentRequired':
    'Hacen falta las dos confirmaciones para poder crear una cuenta.',
  'register.acceptTerms':
    'He leído los {terms}, la {privacy} y el {disclaimer}, y entiendo que este servicio no proporciona asesoramiento médico.',
  'register.termsLink': 'Términos',
  'register.acceptAi':
    'Consiento que el contenido de mis reportes sea procesado por un proveedor externo de inteligencia artificial para extraer y explicar los resultados. {link}',
  'register.whatIsSent': 'Qué se envía',
  'register.creating': 'Creando tu cuenta…',
  'register.createAccount': 'Crear la cuenta',
  'register.verificationNote':
    'Te enviaremos un enlace de verificación a tu correo antes de tu primera subida.',

  // ── Forgot password ───────────────────────────────────────────────────
  'forgot.kicker': 'Contraseña olvidada',
  'forgot.heading': 'Restablece tu contraseña',
  'forgot.lede':
    'Escribe el correo con el que te registraste y te enviaremos un enlace para poner una contraseña nueva.',
  'forgot.sending': 'Enviando…',
  'forgot.sendLink': 'Enviar el enlace',
  'forgot.backToSignIn': 'Volver al inicio de sesión',
  'forgot.sentKicker': 'Enlace enviado',
  'forgot.sentHeading': 'Revisa tu correo',
  'forgot.sentBody':
    'Si existe una cuenta con {email}, el enlace para restablecerla ya va de camino. El enlace caduca en una hora.',
  'forgot.resendIn': 'Reenviar en 0:{seconds}',
  'forgot.resend': 'Reenviar el enlace',
  'forgot.differentEmail': 'Usar otro correo',
  'forgot.noConfirm': 'No confirmamos si una dirección está registrada.',

  // ── Verify email ──────────────────────────────────────────────────────
  'verify.asideHeading': 'Un último paso antes de tu primera subida.',
  'verify.kicker': 'Verificación del correo',
  'verify.heading': 'Verifica tu correo para poder subir reportes',
  'verify.body':
    'Hemos enviado un enlace a {email}. Puedes echar un vistazo mientras tanto, pero para subir un reporte hace falta una dirección verificada.',
  'verify.sent': 'Correo de verificación enviado. Puede tardar un minuto en llegar.',
  'verify.stillUnverified':
    'Esa dirección sigue sin verificar. Abre el enlace del correo y vuelve a intentarlo.',
  'verify.resend': 'Reenviar el correo de verificación',
  'verify.checking': 'Comprobando…',
  'verify.continue': 'Ya lo he verificado: continuar',
  'verify.googleNote':
    'Las cuentas creadas con Google se verifican automáticamente; no hay paso de correo.',
  'verify.lookAround': 'Echar un vistazo primero',

  // ── Landing ───────────────────────────────────────────────────────────
  'landing.badge': 'Herramienta educativa · no es asesoramiento médico',
  'landing.heading': 'Deja de leer tus resultados de laboratorio en PDF.',
  'landing.lede':
    'Sube los reportes que ya tienes. Extraemos cada prueba, valor, unidad e intervalo de referencia, los emparejamos entre laboratorios y los representamos a lo largo del tiempo, con explicaciones en lenguaje llano siempre identificadas como generadas por IA.',
  'landing.uploadFirst': 'Sube tu primer reporte',
  'landing.assurance.private': 'Privado por defecto',
  'landing.assurance.redacted': 'Identificadores eliminados antes de la IA',
  'landing.assurance.export': 'Exporta o elimina cuando quieras',
  'landing.exampleReports': '7 reportes · 2024-2026',
  'landing.chartAlt':
    'Gráfico de tendencia de ejemplo: la hemoglobina a lo largo de siete reportes sobre un intervalo de referencia sombreado; baja por debajo del intervalo una vez, en noviembre de 2025, y vuelve a 14,2 g/dL en julio de 2026.',
  'landing.belowRange': '11,8 · por debajo del intervalo',
  'landing.illustrative':
    'Ejemplo ilustrativo. Los intervalos de referencia mostrados son los impresos en cada reporte.',
  'landing.howItWorks': 'Cómo funciona',
  'landing.step1Title': 'Sube el PDF',
  'landing.step1Body':
    'Arrastra un reporte de cualquier laboratorio. El archivo original se guarda de forma privada y nunca recibe un enlace público.',
  'landing.step2Title': 'Extraemos todos los valores',
  'landing.step2Body':
    'Nombre de la prueba, valor, unidad y el intervalo de referencia impreso en ese reporte, incluidas las páginas escaneadas, mediante OCR.',
  'landing.step3Title': 'Los valores se emparejan y se clasifican',
  'landing.step3Body':
    'Hgb, Hb y Hemoglobina pasan a ser una sola variable. Bajo, normal, alto y crítico se deciden aritméticamente, no con IA.',
  'landing.step4Title': 'Ves el historial completo',
  'landing.step4Body':
    'Un gráfico por variable, además de explicaciones y un análisis preliminar, ambos claramente marcados como generados por IA.',
  'landing.legalNote': 'Lee la {privacy}, los {terms} y la {ai} antes de crear una cuenta.',

  // ── Legal pages ───────────────────────────────────────────────────────
  'legal.lastUpdated': 'Última actualización: {date} · {readingTime}',
  'legal.notFound': 'Ese documento no existe',
  'legal.notFoundBody': 'Comprueba el enlace, o empieza por el aviso médico.',
  'legal.backHome': 'Volver al inicio',
  'legal.pendingTitle': 'Todavía sin publicar',
  'legal.onThisPage': 'En esta página',
  'legal.translationNote':
    'Solo la versión en inglés de este documento tiene valor legal. Cualquier otro idioma se ofrece a título informativo.',
  'legal.kicker': 'Legal',
  'legal.documents': 'Documentos',
  'legal.navLabel': 'Documentos legales',
  'legal.version': 'Versión {version}',
  'legal.previousVersions': 'Las versiones anteriores están disponibles si las solicitas.',
  'legal.notPublishedTitle': 'Este documento todavía no se ha publicado',
  'legal.notPublishedBody':
    'La {title} sigue en redacción y revisión. Hasta que se publique, el {disclaimer} es el documento que rige cómo puede utilizarse esta aplicación. Si necesitas esta política antes de crear una cuenta, escribe al soporte y te enviaremos el borrador actual.',
  'legal.notYetPublished': 'todavía sin publicar',
  'legal.readingTime': 'tiempo de lectura: {time}',
  'legal.doc.dataRetention': 'Política de Conservación de Datos',

  // ── Administración: catálogo de variables (KAN-49) ────────────────────
  'adminVariables.intro':
    'La lista canónica de estudios de laboratorio. Todos los lectores ven estos nombres y explicaciones, y el proceso de extracción compara con ellos los nombres impresos.',
  'adminVariables.countOne': '{count} variable',
  'adminVariables.countMany': '{count} variables',
  'adminVariables.search': 'Buscar en el catálogo',
  'adminVariables.searchPlaceholder': 'Nombre, sinónimo o id',
  'adminVariables.loadingLabel': 'Cargando el catálogo',
  'adminVariables.loadFailed': 'No se pudo cargar el catálogo.',
  'adminVariables.emptyTitle': 'El catálogo está vacío',
  'adminVariables.emptyBody':
    'Importa la hoja de cálculo mantenida, o añade a mano la primera entrada.',
  'adminVariables.noMatchTitle': 'Ninguna variable coincide',
  'adminVariables.noMatchBody': 'Quita un filtro, o busca otro nombre.',
  'adminVariables.showing': 'Mostrando {visible} de {total}.',
  'adminVariables.filterCategory': 'Filtrar por grupo',
  'adminVariables.allCategories': 'Todos los grupos',
  'adminVariables.filterOrigin': 'Filtrar por origen',
  'adminVariables.originAll': 'Cualquier origen',
  'adminVariables.originCatalog': 'Curada',
  'adminVariables.originDiscovered': 'Descubierta',
  'adminVariables.needsReview': 'Falta revisar ({count})',
  'adminVariables.tableCaption': 'Variables de laboratorio del catálogo',
  'adminVariables.columnName': 'Nombre',
  'adminVariables.columnId': 'Id del documento',
  'adminVariables.columnCategory': 'Grupo',
  'adminVariables.columnUnit': 'Unidad',
  'adminVariables.columnAliases': 'Sinónimos',
  'adminVariables.columnState': 'Estado',
  'adminVariables.columnActions': 'Acciones',
  'adminVariables.noUnit': 'Ninguna',
  'adminVariables.noDescription': 'Todavía sin explicación',
  'adminVariables.stateReviewed': 'Revisada',
  'adminVariables.stateNeedsReview': 'Falta revisar',
  'adminVariables.new': 'Nueva variable',
  'adminVariables.edit': 'Editar',
  'adminVariables.editLabel': 'Editar {name}',
  'adminVariables.delete': 'Eliminar',
  'adminVariables.deleteLabel': 'Eliminar {name}',
  'adminVariables.newTitle': 'Nueva variable',
  'adminVariables.editTitle': 'Editar {name}',
  'adminVariables.fieldId': 'Id del documento',
  'adminVariables.fieldIdHint':
    'Minúsculas, dígitos y guiones. Se sugiere a partir del nombre en inglés; cámbialo antes de guardar si necesitas otro.',
  'adminVariables.fieldIdFixed':
    'El id no se puede cambiar después de crear la entrada: ya hay resultados que apuntan a él.',
  'adminVariables.fieldCanonicalName': 'Nombre canónico',
  'adminVariables.fieldCanonicalNameHint':
    'El nombre en inglés con el que se comparan los nombres impresos.',
  'adminVariables.fieldName': 'Nombre visible ({language})',
  'adminVariables.fieldDescription': 'Explicación ({language})',
  'adminVariables.fieldDescriptionHint':
    'En lenguaje sencillo; se muestra en la página de la variable. Déjala vacía antes que inventarla.',
  'adminVariables.fieldAliases': 'Sinónimos',
  'adminVariables.fieldAliasesHint':
    'Uno por línea: las grafías que imprimen los reportes reales, en cualquier idioma. Las comas se conservan.',
  'adminVariables.fieldCategory': 'Grupo',
  'adminVariables.fieldUnit': 'Unidad por omisión',
  'adminVariables.fieldUnitHint':
    'Se usa cuando un reporte imprime un valor sin unidad. La unidad del propio reporte siempre gana.',
  'adminVariables.reviewNote':
    'Al guardar, la entrada queda marcada como curada y revisada, de modo que el proceso de enriquecimiento no la reescribirá.',
  'adminVariables.errorRequired': 'Este campo es obligatorio.',
  'adminVariables.errorInvalidId':
    'Usa minúsculas, dígitos y guiones, empezando por una letra o un dígito.',
  'adminVariables.errorIdTaken': 'Otra variable ya usa este id.',
  'adminVariables.duplicateWarning':
    'Uno de estos nombres coincide con {id}, que ya está en el catálogo. Dos entradas para un mismo estudio parten en dos el historial de quien lo sigue: compruébalo antes de guardar.',
  'adminVariables.create': 'Crear variable',
  'adminVariables.creating': 'Creando…',
  'adminVariables.created': 'Se añadió {name} al catálogo.',
  'adminVariables.updated': 'Se actualizó {name}.',
  'adminVariables.saveFailed': 'No se pudo guardar la variable.',
  'adminVariables.existsFailed':
    'Ese id se ocupó mientras editabas. Elige otro.',
  'adminVariables.deleteTitle': '¿Eliminar {name}?',
  'adminVariables.deleteBody':
    'Se elimina la entrada del catálogo: este nombre, sus traducciones y su explicación dejan de mostrarse a todos los lectores.',
  'adminVariables.deleteKeeps':
    'Ningún resultado se ve afectado. Quien siga este estudio conserva sus valores y su historial, encabezados con lo que imprimió su propio laboratorio.',
  'adminVariables.deleteReturns':
    'Puede volver por su cuenta: el siguiente reporte que imprima este estudio no encontrará coincidencia y el proceso creará un marcador sin revisar. Casi siempre es mejor corregir una entrada que eliminarla.',
  'adminVariables.deleteConfirm': 'Eliminar variable',
  'adminVariables.deleting': 'Eliminando…',
  'adminVariables.deleted': 'Se eliminó {name} del catálogo.',
  'adminVariables.deleteFailed': 'No se pudo eliminar la variable.',

  // ── Administración: usuarios (KAN-50) ─────────────────────────────────
  'adminUsers.intro':
    'Todas las cuentas del sistema. Aquí se cambian los roles y el acceso; los resultados de laboratorio no se pueden leer desde esta pantalla.',
  'adminUsers.countOne': '{count} cuenta',
  'adminUsers.countMany': '{count} cuentas',
  'adminUsers.search': 'Buscar cuentas',
  'adminUsers.searchPlaceholder': 'Correo, nombre o id de usuario',
  'adminUsers.loadingLabel': 'Cargando cuentas',
  'adminUsers.loadFailed': 'No se pudieron cargar las cuentas.',
  'adminUsers.emptyTitle': 'Todavía no hay cuentas',
  'adminUsers.emptyBody': 'Las cuentas aparecen aquí en cuanto alguien se registra.',
  'adminUsers.noMatchTitle': 'Ninguna cuenta coincide',
  'adminUsers.noMatchBody': 'Quita un filtro, o busca otra dirección.',
  'adminUsers.showing': 'Mostrando {visible} de {total}.',
  'adminUsers.filterRole': 'Filtrar por rol',
  'adminUsers.roleAll': 'Cualquier rol',
  'adminUsers.roleUser': 'Usuario',
  'adminUsers.roleAdmin': 'Administrador',
  'adminUsers.filterStatus': 'Filtrar por acceso',
  'adminUsers.statusAll': 'Cualquier acceso',
  'adminUsers.statusActive': 'Activa',
  'adminUsers.statusDisabled': 'Desactivada',
  'adminUsers.tableCaption': 'Cuentas registradas en el sistema',
  'adminUsers.columnAccount': 'Cuenta',
  'adminUsers.columnRole': 'Rol',
  'adminUsers.columnStatus': 'Acceso',
  'adminUsers.columnJoined': 'Registro',
  'adminUsers.columnActions': 'Acciones',
  'adminUsers.noName': 'Sin nombre',
  'adminUsers.you': 'Tú',
  'adminUsers.unknownDate': 'Desconocida',
  'adminUsers.loadMore': 'Cargar más cuentas',
  'adminUsers.limitNote':
    'Mostrando las {count} cuentas registradas más recientemente. La búsqueda abarca las cuentas cargadas hasta ahora.',
  'adminUsers.changeRole': 'Cambiar rol',
  'adminUsers.changeRoleLabel': 'Cambiar el rol de {name}',
  'adminUsers.roleTitle': 'Cambiar el rol de {name}',
  'adminUsers.promoteBody':
    'Un administrador puede leer todas las cuentas del sistema, cambiar roles, desactivar cuentas y editar el catálogo de variables.',
  'adminUsers.demoteBody':
    'Esta cuenta pierde el acceso a las pantallas de administración y a las demás cuentas.',
  'adminUsers.roleClaimNote':
    'El cambio se escribe en el token de la cuenta y llega a sus sesiones abiertas la próxima vez que se renueve: dentro de una hora, o de inmediato si vuelve a iniciar sesión.',
  'adminUsers.promoteConfirm': 'Hacer administrador',
  'adminUsers.demoteConfirm': 'Hacer usuario',
  'adminUsers.roleSaving': 'Guardando…',
  'adminUsers.roleChanged': '{name} ahora es {role}.',
  'adminUsers.roleFailed': 'No se pudo cambiar el rol.',
  'adminUsers.selfActions': 'No puedes cambiar tu propio rol ni tu acceso.',
  'adminUsers.disable': 'Desactivar',
  'adminUsers.disableLabel': 'Desactivar {name}',
  'adminUsers.enable': 'Reactivar',
  'adminUsers.enableLabel': 'Reactivar {name}',
  'adminUsers.disableTitle': '¿Desactivar {name}?',
  'adminUsers.disableBody':
    'No podrá volver a iniciar sesión hasta que un administrador reactive la cuenta, y ninguna sesión abierta podrá renovarse.',
  'adminUsers.disableWindow':
    'Una sesión abierta en este momento sigue leyendo sus propios datos hasta que su token caduque: como mucho, una hora. Para cortar el acceso de inmediato, elimina la cuenta.',
  'adminUsers.disableKeeps':
    'No se elimina nada. Sus reportes, resultados e historial quedan tal cual, y vuelven intactos si se reactiva la cuenta.',
  'adminUsers.disableReason': 'Motivo (opcional)',
  'adminUsers.disableReasonHint':
    'Se registra en la bitácora de auditoría junto a quién lo hizo y cuándo. No se le muestra al titular de la cuenta.',
  'adminUsers.disableConfirm': 'Desactivar cuenta',
  'adminUsers.disabling': 'Desactivando…',
  'adminUsers.disabledToast': '{name} ya no puede iniciar sesión.',
  'adminUsers.enableTitle': '¿Reactivar {name}?',
  'adminUsers.enableBody':
    'Podrá iniciar sesión de inmediato y encontrará sus reportes e historial tal como los dejó.',
  'adminUsers.enableConfirm': 'Reactivar cuenta',
  'adminUsers.enabling': 'Reactivando…',
  'adminUsers.enabledToast': '{name} ya puede iniciar sesión.',
  'adminUsers.accessFailed': 'No se pudo cambiar el acceso de la cuenta.',


  // ── Administración: panorama (KAN-18) ─────────────────────────────────
  'adminOverview.intro':
    'El estado del sistema en conjunto. Solo conteos y capacidad: en esta pantalla no aparece ningún valor de laboratorio ni los resultados de ninguna cuenta.',
  'adminOverview.loadingLabel': 'Cargando el panorama del sistema',
  'adminOverview.loadFailed': 'No se pudo cargar el panorama.',
  'adminOverview.healthOk': 'Funcionamiento normal',
  'adminOverview.healthAttention': 'Requiere atención',
  'adminOverview.healthBlocked': 'Las cargas están desactivadas',
  'adminOverview.healthBlockedBody':
    'El interruptor general está activado, así que ninguna cuenta puede subir un reporte. Se libera cuando el almacenamiento vuelve a estar por debajo del límite.',
  'adminOverview.healthAttentionBody':
    'Nada está bloqueado, pero algo de lo siguiente pide una revisión.',
  'adminOverview.healthOkBody':
    'Ningún reporte falló y el almacenamiento está holgado dentro de su límite.',
  'adminOverview.accountsHeading': 'Cuentas',
  'adminOverview.accountsTotal': 'Registradas',
  'adminOverview.accountsAdmins': 'Con acceso de administrador',
  'adminOverview.accountsDisabled': 'Desactivadas',
  'adminOverview.accountsLink': 'Administrar cuentas',
  'adminOverview.reportsHeading': 'Reportes',
  'adminOverview.reportsTotal': 'Subidos',
  'adminOverview.reportsProcessed': 'Procesados',
  'adminOverview.reportsFailed': 'Fallidos',
  'adminOverview.reportsFailedNote':
    'Cada falla es una persona cuyo reporte nunca regresó. {ticket} construye la cola de reintentos.',
  'adminOverview.catalogHeading': 'Catálogo de variables',
  'adminOverview.catalogTotal': 'Entradas',
  'adminOverview.catalogNeedsReview': 'Pendientes de revisión',
  'adminOverview.catalogLink': 'Abrir el catálogo',
  'adminOverview.storageHeading': 'Almacenamiento',
  'adminOverview.storageUsed': '{used} de {limit} en uso',
  'adminOverview.storageUploadsOn': 'Se aceptan cargas',
  'adminOverview.storageUploadsOff': 'Se rechazan cargas',
  'adminOverview.auditHeading': 'Acciones administrativas recientes',
  'adminOverview.auditEmpty': 'Todavía no se ha hecho nada.',
  'adminOverview.auditNote':
    'Las escribe el servidor, nunca el navegador. El registro completo vive en la colección auditLogs.',
  'adminOverview.auditRoleChanged': 'Cambio de rol',
  'adminOverview.auditUserDisabled': 'Cuenta desactivada',
  'adminOverview.auditUserEnabled': 'Cuenta reactivada',
  'adminOverview.auditAccountDeleted': 'Cuenta eliminada por su titular',
  'adminOverview.auditUnknown': 'Acción registrada',
  'adminOverview.auditActor': 'por {actor}',
  'adminOverview.auditActorRedacted': 'por una cuenta eliminada',
  'adminOverview.auditTarget': 'sobre {target}',
  'adminOverview.auditNoTarget': 'sin cuenta señalada',
  'adminOverview.refresh': 'Actualizar',
  'adminOverview.refreshing': 'Actualizando…',
  'common.admin': 'Administrador',
  'common.adminAccessLabel': 'Tienes acceso de administrador',


  // ── Paginación ────────────────────────────────────────────────────────
  'pagination.showing': 'Mostrando {from}–{to} de {total}',
  'pagination.previous': 'Anterior',
  'pagination.next': 'Siguiente',
  'pagination.goToPage': 'Ir a la página {page}',
  'pagination.catalogPages': 'Páginas del catálogo',
  'pagination.accountPages': 'Páginas de cuentas',

};
