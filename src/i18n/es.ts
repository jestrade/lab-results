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
 * `informe` is used for a laboratory report throughout, never `reporte`.
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
  'nav.dashboard': 'Panel',
  'nav.upload': 'Subir informe',
  'nav.reports': 'Informes',
  'nav.variables': 'Variables de laboratorio',
  'nav.trends': 'Análisis de tendencias',
  'nav.account': 'Cuenta',
  'nav.profile': 'Perfil',
  'nav.settings': 'Configuración de la cuenta',
  'nav.administration': 'Administración',
  'nav.adminOverview': 'Resumen de administración',
  'nav.adminUsers': 'Usuarios',
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
  'dropzone.prompt': 'Arrastra aquí el PDF de tu laboratorio',
  'dropzone.hint': 'o elige un archivo de tu equipo: solo PDF, hasta 25 MB',
  'password.show': 'Mostrar la contraseña',
  'password.hide': 'Ocultar la contraseña',
  'google.waiting': 'Esperando a Google…',
  'quota.used': '{label}: {percent} % utilizado',
  'quota.ofTotal': '{used} de {total}',
  'quota.full': 'Sin espacio. Elimina algún informe que ya no necesites para liberar espacio.',
  'quota.remaining': 'Quedan {amount}',
  'skeleton.loadingResults': 'Cargando los resultados',
  'chart.date': 'Fecha',

  // ── Status tables (@/domain/status) ───────────────────────────────────
  'status.result.normal': 'Normal',
  'status.result.normal.description':
    'Dentro del intervalo de referencia impreso en este informe.',
  'status.result.low': 'Bajo',
  'status.result.low.description':
    'Por debajo del intervalo de referencia impreso en este informe.',
  'status.result.high': 'Alto',
  'status.result.high.description':
    'Por encima del intervalo de referencia impreso en este informe.',
  'status.result.critical': 'Crítico',
  'status.result.critical.description':
    'Fuera de los umbrales críticos indicados por el laboratorio. Puede requerir atención médica sin demora.',
  'status.result.unknown': 'Sin clasificar',
  'status.result.unknown.description':
    'Este informe no incluía un intervalo de referencia utilizable, por lo que el valor no se ha clasificado.',

  'status.report.uploaded': 'Subido',
  'status.report.uploaded.description':
    'El archivo está guardado y a la espera de entrar en la cola de procesamiento.',
  'status.report.queued': 'En cola',
  'status.report.queued.description': 'A la espera de un turno de procesamiento.',
  'status.report.processing': 'Procesando',
  'status.report.processing.description': 'Se están extrayendo los resultados del informe.',
  'status.report.processed': 'Procesado',
  'status.report.processed.description': 'Todos los resultados se han extraído correctamente.',
  'status.report.partiallyProcessed': 'Procesado parcialmente',
  'status.report.partiallyProcessed.description':
    'Se ha extraído la mayoría de los resultados; algunos valores no se han podido leer de forma fiable.',
  'status.report.failed': 'Fallido',
  'status.report.failed.description': 'No se ha podido procesar el informe.',

  // Movimiento, nunca valoración: describen hacia dónde va el valor, sin
  // sugerir que eso sea bueno o malo.
  'status.trend.increasing': 'En aumento',
  'status.trend.increasing.description':
    'El valor ha subido a lo largo de los informes recientes.',
  'status.trend.decreasing': 'En descenso',
  'status.trend.decreasing.description':
    'El valor ha bajado a lo largo de los informes recientes.',
  'status.trend.stable': 'Estable',
  'status.trend.stable.description':
    'El valor no se ha movido de forma apreciable a lo largo de los informes recientes.',
  'status.trend.insufficient': 'Datos insuficientes',
  'status.trend.insufficient.description':
    'Todavía no hay suficientes mediciones para describir una dirección.',

  'status.confidence.high': 'Confianza alta',
  'status.confidence.high.description': 'Este valor se ha leído con claridad del informe.',
  'status.confidence.medium': 'Confianza media',
  'status.confidence.medium.description':
    'Este valor se ha leído con cierta incertidumbre. Compruébalo con el informe.',
  'status.confidence.low': 'Confianza baja',
  'status.confidence.low.description':
    'Este valor no se ha podido leer de forma fiable. Compruébalo con el informe original antes de darlo por bueno.',

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

  // ── Dashboard ─────────────────────────────────────────────────────────
  'dashboard.kicker': 'Tu historial de laboratorio',
  'dashboard.welcome': 'Hola, {name}',
  'dashboard.uploadReport': 'Subir un informe',
  'dashboard.emptyTitle': 'Todavía no hay informes',
  'dashboard.emptyBody':
    'Sube un informe de laboratorio y se extraerá cada prueba, valor, unidad e intervalo de referencia que contenga, para seguirlos a lo largo del tiempo.',
  'dashboard.uploadFirst': 'Sube tu primer informe',

  // ── Not found / coming soon ───────────────────────────────────────────
  'notFound.title': 'Esa página no existe',
  'notFound.body': 'Puede que el enlace esté anticuado o que la página haya cambiado de sitio.',
  'notFound.back': 'Volver al inicio',
  'comingSoon.title': 'Todavía sin construir',
  'comingSoon.body': '{description} Esta pantalla la construye {ticket}.',
  'comingSoon.adminOverviewBody':
    'Métricas de todo el sistema: usuarios, informes, fallos y tiempo medio de procesamiento.',
  'comingSoon.adminUsersBody':
    'Busca cuentas, revisa su actividad y desactívalas o vuelve a activarlas.',
  'comingSoon.adminJobsBody':
    'Trabajos de extracción en curso y fallidos, con sus duraciones y controles de reintento.',

  // ── Account settings ──────────────────────────────────────────────────
  'settings.aiHeading': 'Procesamiento con IA',
  'settings.agreed': 'Aceptado',
  'settings.notAgreed': 'Sin aceptar',
  'settings.aiIntro':
    'Para leer un informe enviamos su texto a {provider}, un proveedor externo de inteligencia artificial. Antes se eliminan los identificadores que somos capaces de detectar: direcciones de correo, números de teléfono, números de historia clínica y fechas.',
  'settings.aiFact.notAnonymised':
    'Esto {emphasis}. Los nombres escritos dentro del documento no se pueden eliminar de forma fiable de manera automática.',
  'settings.aiFact.notAnonymisedEmphasis': 'no es una anonimización completa',
  'settings.aiFact.freeTier':
    'En el plan gratuito, las condiciones de Google permiten que el contenido enviado se utilice para mejorar sus productos.',
  'settings.aiFact.noPdf':
    'El PDF original nunca se envía: solo el texto extraído de él, ya redactado.',
  'settings.aiFact.calculated':
    'Que un resultado sea bajo, normal, alto o crítico se calcula a partir del intervalo impreso en tu informe; no lo decide la IA.',
  'settings.fullDetail': 'Todos los detalles en la {document}.',
  'settings.agreedOn': 'Diste tu consentimiento el {date}.',
  'settings.withdraw': 'Retirar el consentimiento',
  'settings.blocked':
    'No se puede procesar ningún informe hasta que lo aceptes. Puedes seguir sin subir nada, y los informes ya procesados no se ven afectados.',
  'settings.agree': 'Lo entiendo y lo acepto',
  'settings.withdrawTitle': '¿Retirar el consentimiento para el procesamiento con IA?',
  'settings.keepIt': 'Mantenerlo',
  'settings.withdrawing': 'Retirando…',
  'settings.withdrawBody1':
    'Los informes nuevos no se procesarán y no podrás subir ninguno hasta que vuelvas a aceptarlo. Desde el momento en que lo retires no se envía nada al proveedor de IA.',
  'settings.withdrawBody2':
    'Los informes ya procesados conservan sus resultados. Retirar el consentimiento no elimina nada: para eliminar tus datos, {deleteLink}.',
  'settings.deleteAccountLink': 'elimina tu cuenta',
  'settings.otherHeading': 'Notificaciones y exportación de datos',
  'settings.otherBody':
    'Todavía sin construir: las notificaciones son KAN-48 y la exportación de datos es KAN-23 (spec §56). Tu nombre, tu contraseña y tu contexto de salud están en {profileLink}, y allí mismo puedes {deleteLink}.',
  'settings.profileLink': 'Perfil',
  'settings.deletingAccount': 'eliminar tu cuenta',

  // ── Reports list ──────────────────────────────────────────────────────
  'reports.loading': 'Cargando',
  'reports.countOne': '{count} informe',
  'reports.countMany': '{count} informes',
  'reports.resultsCount': '{count} resultados',
  'reports.filter.all': 'Todos',
  'reports.filterLabel': 'Filtrar los informes por estado',
  'reports.emptyTitle': 'Todavía no hay informes',
  'reports.emptyBody':
    'Sube tu primer PDF de laboratorio y extraeremos los resultados, los cruzaremos con los intervalos de referencia y empezaremos a seguir cada valor a lo largo del tiempo.',
  'reports.uploadFirst': 'Sube tu primer informe',
  'reports.col.reportDate': 'Fecha del informe',
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
  'reports.caption': 'Tus informes de laboratorio',
  'reports.captionFiltered': 'Tus informes de laboratorio, filtrados por {status}',
  'reports.noMatchTitle': 'Nada coincide con este filtro',
  'reports.noMatchBody': 'Ahora mismo ningún informe tiene ese estado.',
  'reports.deleteTitle': '¿Eliminar este informe?',
  'reports.deletePermanently': 'Eliminar definitivamente',
  'reports.deleting': 'Eliminando…',
  'reports.deleteBody':
    'Se eliminarán {file} y todos los resultados extraídos de él. Esto no se puede deshacer, y los valores que aportaba desaparecerán de tus tendencias.',
  'reports.deleteFreed': 'Se liberarán {size} de tu almacenamiento.',
  'reports.loadFailed':
    'No hemos podido cargar tus informes. Comprueba tu conexión e inténtalo de nuevo.',
  'reports.openFailed': 'No se ha podido abrir ese archivo. Puede que todavía se esté subiendo.',
  'reports.retryFailedAgain': 'Ese informe tampoco se ha podido procesar esta vez.',
  'reports.retrySucceeded': 'El procesamiento ha terminado. Los resultados están listos.',
  'reports.deleted': 'Informe eliminado. Se han liberado {size} de tu almacenamiento.',
  'reports.deleteFailed': 'No se ha podido eliminar ese informe. Inténtalo de nuevo.',
  'reports.retryFailed':
    'No hemos podido reiniciar el procesamiento de este informe. Inténtalo de nuevo dentro de unos minutos.',
  'reports.failedRetryable': 'El procesamiento ha fallado. Puedes volver a intentarlo.',
  'reports.failedReupload': 'El procesamiento ha fallado. Prueba a subir el archivo de nuevo.',
  'reports.extracting': 'Extrayendo los resultados…',
  'reports.pageOne': '{count} página',
  'reports.pageMany': '{count} páginas',

  // ── File and quota refusals ───────────────────────────────────────────
  'fileError.empty': '{file} está vacío. No se ha subido nada.',
  'fileError.notPdf':
    '{file} no es un PDF. Los informes de laboratorio deben subirse como archivo PDF. No se ha subido nada.',
  'fileError.tooLarge': '{file} ocupa {size} y supera el límite de {limit}. No se ha subido nada.',
  'quotaError.uploadsDisabled':
    'Las subidas están pausadas mientras trabajamos en la capacidad. Tus informes actuales no se ven afectados. Inténtalo de nuevo más tarde.',
  'quotaError.fileTooLarge':
    'Ese archivo ocupa {size} y supera el límite de {limit} por informe. No se ha subido nada.',
  'quotaError.storageFull':
    'Este informe necesita {needed} y solo te quedan {free} de tus {allowance}. Elimina algún informe que ya no necesites y vuelve a intentarlo. No se ha subido nada.',
  'quotaError.uploadsExhausted':
    'Has agotado las {limit} subidas de este mes. Tu asignación se renueva el día 1. No se ha subido nada.',
  'quotaError.systemFull':
    'El servicio está al límite de capacidad y ahora mismo no puede aceptar informes nuevos. No se ha subido nada: inténtalo más tarde o escribe al soporte.',

  'storageError.unauthorized':
    'El servidor ha rechazado esta subida. Suele deberse a un problema de configuración por nuestra parte y no a un problema con tu archivo. Escribe al soporte indicando la referencia de abajo. No se ha guardado nada.',
  'storageError.quotaExceeded':
    'No hay espacio de almacenamiento disponible para este informe. Elimina algún informe que ya no necesites y vuelve a intentarlo. No se ha guardado nada.',
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
    'Solo PDF, hasta {perFile} por informe, dentro de tu asignación de {allowance}. Tu archivo se guarda de forma privada y se procesa en nuestros servidores; nunca se envía directamente desde tu navegador a un tercero.',
  'upload.allowanceLabel': 'Tu asignación de almacenamiento',
  'upload.storageUsed': 'Almacenamiento utilizado',
  'upload.uploadsThisMonth': 'Subidas de este mes',
  'upload.uploadsDetail': '{used} de {limit} utilizadas · se renueva el día 1',
  'upload.pausedTitle': 'Las subidas están pausadas',
  'upload.pausedBody':
    'El servicio está al límite de capacidad, así que ahora mismo no se pueden aceptar informes nuevos. Tus informes y resultados actuales no se ven afectados.',
  'upload.storageFullTitle': 'Tu almacenamiento está lleno',
  'upload.storageFullBody':
    'Elimina algún informe que ya no necesites para liberar espacio. Estás utilizando {used} de {limit}.',
  'upload.storageLowTitle': 'Te queda poco espacio',
  'upload.storageLowBody':
    'Te quedan {remaining} de {limit}. Eliminar informes que ya no necesites liberará espacio.',
  'upload.consentTitle': 'Antes de tu primera subida',
  'upload.consentBody1':
    'Para leer tu informe enviamos su contenido a {provider}, un proveedor externo de inteligencia artificial. Antes se eliminan los identificadores que somos capaces de detectar (direcciones de correo, números de teléfono, números de historia clínica y fechas), pero esto no es una anonimización completa: {emphasis}.',
  'upload.consentEmphasis':
    'los nombres escritos dentro del documento no se pueden eliminar de forma fiable',
  'upload.consentBody2':
    'En el plan gratuito, las condiciones de Google permiten que el contenido enviado se utilice para mejorar sus productos. {link}.',
  'upload.consentLink': 'Qué se envía, en detalle',
  'upload.verifyTitle': 'Verifica tu correo antes de subir nada',
  'upload.verifyBody':
    'Para subir un informe hace falta una dirección verificada. Te enviamos un enlace cuando creaste tu cuenta.',
  'upload.verifyAction': 'Verificar mi correo',
  'upload.rejectedTitle': 'Ese archivo no se ha aceptado',
  'upload.failedTitle': 'La subida ha fallado',
  'upload.disabled.verify': 'Verifica antes tu dirección de correo.',
  'upload.disabled.consent': 'Acepta el procesamiento con IA antes de subir nada.',
  'upload.disabled.capacity':
    'El servicio está al límite de capacidad. Inténtalo de nuevo más tarde.',
  'upload.disabled.storageFull':
    'Tu almacenamiento está lleno. Elimina algún informe para liberar espacio.',
  'upload.disabled.monthly': 'Has agotado todas tus subidas de este mes.',
  'upload.cancelLabel': 'Cancelar la subida de {file}',
  'upload.progressLabel': 'Subiendo {file}',
  'upload.storedTitle': 'Informe guardado',
  'upload.storedBody':
    '{file} se ha subido correctamente. Puedes salir de esta página: el procesamiento continúa y tu informe aparecerá en Informes cuando termine.',
  'upload.another': 'Subir otro',
  'upload.goToReports': 'Ir a los informes',
  'upload.uploaded': 'Informe subido. El procesamiento empieza automáticamente.',
  'upload.cancelled': 'Subida cancelada.',
  'upload.statusHeading': 'Estado del procesamiento',
  'upload.statusLabel': 'Progreso del procesamiento del informe',
  'upload.statusFoot':
    'Puedes salir de esta página: el procesamiento continúa y tu informe aparecerá en Informes cuando termine.',
  'upload.step.stored': '{size} guardados',
  'upload.step.transferred': '{percent} % transferido',
  'upload.step.chooseFile': 'Elige un PDF para empezar',
  'upload.step.waitingSlot': 'A la espera de un turno de procesamiento',
  'upload.step.extracting': 'Extrayendo los resultados',
  'upload.step.ready': 'Resultados y explicaciones listos',

  // ── Report details ────────────────────────────────────────────────────
  'detail.loadFailed': 'No hemos podido cargar este informe. Puede que se haya eliminado.',
  'detail.resultsLoadFailed': 'No hemos podido cargar los resultados de este informe.',
  'detail.openFailed': 'No se ha podido abrir ese archivo.',
  'detail.missingTitle': 'Ese informe no existe',
  'detail.missingBody': 'Puede que se haya eliminado o que el enlace sea incorrecto.',
  'detail.backToReports': 'Volver a los informes',
  'detail.reprocessing': 'Reprocesando…',
  'detail.tryAgain': 'Intentar procesarlo de nuevo',
  'detail.reportOf': 'Informe del {date}',
  'detail.downloadOriginal': 'Descargar el original',
  'detail.criticalOne': '{count} resultado fuera del intervalo crítico',
  'detail.criticalMany': '{count} resultados fuera del intervalo crítico',
  'detail.partialTitle': 'Algunos valores no se han podido leer',
  'detail.failedTitle': 'Este informe no se ha podido procesar',
  'detail.failedFallback': 'Algo ha fallado al procesar este informe.',
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
  'detail.nothingExtracted': 'No se ha extraído nada de este informe.',
  'detail.tableCaption': 'Resultados extraídos de {file}',
  'detail.col.test': 'Prueba',
  'detail.col.value': 'Valor',
  'detail.col.unit': 'Unidad',
  'detail.col.range': 'Intervalo de referencia',
  'detail.col.status': 'Estado',
  'detail.notStated': 'No indicado',
  'detail.aiGenerated': 'Generado por IA · no es asesoramiento médico',
  'detail.promptVersion': '{model} · prompt {version}',
  'detail.metaLabel': 'Metadatos del informe',
  'detail.meta.laboratory': 'Laboratorio',
  'detail.meta.notStated': 'No consta en este informe',
  'detail.meta.reportDate': 'Fecha del informe',
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
    'Cuando se haya procesado un informe, cada prueba que contenga aparecerá aquí con su último valor y con cómo se ha movido a lo largo del tiempo.',
  'variables.filterCategory': 'Filtrar por categoría',
  'variables.allCategories': 'Todas las categorías',
  'variables.outOfRangeOnly': 'Solo fuera de intervalo ({count})',
  'variables.noMatchTitle': 'Nada coincide',
  'variables.noMatchBody': 'Ninguna variable en seguimiento coincide con esos filtros.',
  'variables.groupCountOne': '{count} variable',
  'variables.groupCountMany': '{count} variables',
  'variables.showing': 'Mostrando {visible} de {total} variables.',
  'variables.cardLabel': '{name}, {value}',
  'variables.clearHeading': 'Borrar los datos de tus variables',
  'variables.clearIntro':
    'Los valores de esta página se guardan como un historial por prueba, construido a partir de todos los informes procesados. Al eliminar un informe se borra el archivo, no lo que aportó a ese historial: esto borra el historial en sí.',
  'variables.clearButton': 'Borrar los datos de las variables',
  'variables.clearTitle': '¿Borrar todos los datos de las variables?',
  'variables.clearBody':
    'Se eliminarán las {count} variables en seguimiento y todas las mediciones que hay detrás. {emphasis}',
  'variables.clearBodyEmphasis': 'No se puede deshacer.',
  'variables.clearKeeps':
    'Tus informes y los resultados de cada uno de ellos no se tocan. Esta página se volverá a llenar a medida que se procesen nuevos informes.',
  'variables.clearCancel': 'Conservarlos',
  'variables.clearConfirm': 'Borrarlo todo',
  'variables.clearing': 'Borrando…',
  'variables.clearedOne': 'Se ha borrado {count} variable.',
  'variables.clearedMany': 'Se han borrado {count} variables.',
  'variables.clearFailed':
    'No se han podido borrar los datos de tus variables. Inténtalo de nuevo.',

  // ── Trends ────────────────────────────────────────────────────────────
  'trends.kicker': 'Comparar variables',
  'trends.period.12m': 'Últimos 12 meses',
  'trends.period.3y': 'Últimos 3 años',
  'trends.period.all': 'Todo el historial',
  'trends.emptyTitle': 'Todavía no hay nada que representar',
  'trends.emptyBody':
    'Cuando se haya procesado un informe, cada prueba que contenga podrá representarse aquí. Para indicar una dirección hacen falta al menos {min} mediciones de la misma prueba.',
  'trends.variables': 'Variables',
  'trends.selectedCount': '{selected} de {total} seleccionadas',
  'trends.clear': 'Quitar la selección',
  'trends.period': 'Periodo',
  'trends.chooseTitle': 'Elige una variable',
  'trends.chooseBody':
    'Selecciona arriba una o varias pruebas para representarlas a lo largo del tiempo.',
  'trends.note':
    'Cada gráfico conserva su propia escala y su propio intervalo de referencia, de modo que los valores siguen siendo los impresos en tus informes. Comparten el eje temporal, así que puedes leerlos unos frente a otros.',
  'trends.tooFewOne':
    '{count} medición por ahora. Para indicar una dirección hacen falta al menos {min}, así que no se muestra ninguna; las mediciones sí se representan.',
  'trends.tooFewMany':
    '{count} mediciones por ahora. Para indicar una dirección hacen falta al menos {min}, así que no se muestra ninguna; las mediciones sí se representan.',

  // ── Trend chart ───────────────────────────────────────────────────────
  'chart.noMeasurements': 'No hay mediciones en este periodo.',
  'chart.summaryOne':
    '{name}: {count} medición, del {firstDate} al {lastDate}, de {firstValue} a {lastValue}. Intervalo de referencia {range}.',
  'chart.summaryMany':
    '{name}: {count} mediciones, del {firstDate} al {lastDate}, de {firstValue} a {lastValue}. Intervalo de referencia {range}.',
  'chart.rangeNotStated': 'no indicado en el informe',
  'chart.showTableOne': 'Ver la {count} medición en forma de tabla',
  'chart.showTableMany': 'Ver las {count} mediciones en forma de tabla',
  'chart.tableCaption': 'Mediciones de {name}',
  'chart.value': 'Valor',

  // ── Detalle de la variable (KAN-14 / KAN-46) ──────────────────────────
  'variable.loadFailed':
    'No hemos podido cargar esta variable. Comprueba tu conexión e inténtalo de nuevo.',
  'variable.historyFailed':
    'No hemos podido leer las mediciones de esta variable. Lo que se muestra arriba sigue procediendo de tus informes; el historial de abajo está incompleto.',
  'variable.missingTitle': 'No hay seguimiento de esta prueba',
  'variable.missingBody':
    'Puede que el enlace esté anticuado o que esta variable se haya borrado. Sube un informe que incluya esta prueba y aparecerá aquí.',
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
    'Compuesto a partir de tus {count} informes procesados más recientes. Lo anterior a ellos no se incluye aquí.',
  'variable.qualitativeHeading': 'Valores informados',
  'variable.qualitativeBody':
    'Estos resultados no eran números. Se muestran tal como los escribió el laboratorio, porque convertir «Negativo» en una cifra afirmaría algo que el informe nunca dijo.',
  'variable.explanationHeading': 'Qué mide esta prueba',
  'variable.explanationMissing': 'Todavía no se ha escrito una explicación de esta prueba.',
  'variable.explanationUnreviewed':
    'Redactada automáticamente a partir del nombre impreso en un informe, sin revisión de una persona.',
  'variable.aliases': 'También impreso como {names}',
  'variable.analysisHeading': 'Análisis de tu último resultado',
  'variable.analysisOf': 'Redactado para el resultado del {date}',
  'variable.analysisMissing':
    'No se ha generado ningún análisis de esta prueba. Solo se redacta para resultados fuera de su intervalo de referencia, y únicamente si has aceptado el procesamiento con IA.',
  'variable.tableHeading': 'Todas las mediciones',
  'variable.tableEmpty': 'No se han encontrado mediciones de esta prueba en tus informes.',
  'variable.tableCaption': 'Todas las mediciones de {name} en tus informes',
  'variable.col.date': 'Fecha',
  'variable.col.report': 'Informe',
  'variable.openReport': 'Abrir el informe',

  // ── Gráfico interactivo de la variable ────────────────────────────────
  'variableChart.pointLabel':
    '{name} el {date}: {value}, {status}. Actívalo para ver el informe del que procede.',
  'variableChart.zoomHint':
    'Arrastra sobre el gráfico para acotar el periodo. Los botones de periodo de arriba hacen lo mismo sin ratón.',
  'variableChart.resetZoom': 'Restablecer el zoom',
  'variableChart.openReport': 'Abrir el informe',
  'variableChart.rangeOnReport': 'Intervalo en este informe {range}',
  'variableChart.noRangeOnReport': 'Este informe no indicaba ningún intervalo de referencia',

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
    'Rellenar esto no convierte el análisis en una valoración médica. Nada de lo que pongas aquí se usa para decidir si un resultado es normal: eso siempre se calcula a partir del intervalo de referencia impreso en tu propio informe.',
  'profile.contextUnusedEmphasis': 'Todavía no se usa para el análisis.',
  'profile.contextUnused':
    '{emphasis} Esto se guarda en tu cuenta, pero el análisis con IA no lo lee. Enviarlo ampliaría lo que sale de esta aplicación más allá de lo que describe hoy el consentimiento de procesamiento con IA, así que antes hay que actualizar ese texto.',
  'profile.saveFailed': 'No hemos podido guardar esto. Comprueba tu conexión e inténtalo de nuevo.',
  'profile.removeFailed':
    'No hemos podido eliminar esto. Comprueba tu conexión e inténtalo de nuevo.',
  'profile.dateOfBirth': 'Fecha de nacimiento',
  'profile.dateOfBirthHint': 'Se usa para calcular tu edad en el momento de cada informe.',
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
    'Se eliminarán de tu cuenta tu fecha de nacimiento, tu sexo, tu estado de embarazo, tu medicación, tus condiciones y tus síntomas. Tus informes y tus resultados no se ven afectados.',

  // ── Account deletion ──────────────────────────────────────────────────
  'profile.dataHeading': 'Tus datos',
  'profile.consentElsewhere':
    'La privacidad y el consentimiento de procesamiento con IA están en {link}.',
  'profile.exportEmphasis': 'La exportación de datos todavía no está construida',
  'profile.exportBody':
    '{emphasis} (KAN-23). Escríbenos si necesitas una copia de tus informes antes de eliminar tu cuenta: la eliminación no se puede deshacer.',
  'profile.deleted.profile':
    'Tu perfil: nombre, correo y todo lo que hayas rellenado en «Sobre ti».',
  'profile.deleted.reports': 'Todos los informes que hayas subido, incluidos los PDF originales.',
  'profile.deleted.results':
    'Todos los valores extraídos de esos informes y las explicaciones de la IA sobre ellos.',
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
    '{emphasis} Tus informes, tus resultados, su historial y tu acceso se borran de nuestra base de datos y de nuestro almacenamiento de archivos. No hay ninguna copia de seguridad desde la que podamos restaurarte.',
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
    'Tus informes y los valores extraídos de ellos solo los ves tú. Los archivos se guardan de forma privada y se procesan en nuestros servidores; el PDF original nunca recibe un enlace público.',
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
    'Consiento que el contenido de mis informes sea procesado por un proveedor externo de inteligencia artificial para extraer y explicar los resultados. {link}',
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
  'verify.heading': 'Verifica tu correo para poder subir informes',
  'verify.body':
    'Hemos enviado un enlace a {email}. Puedes echar un vistazo mientras tanto, pero para subir un informe hace falta una dirección verificada.',
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
    'Sube los informes que ya tienes. Extraemos cada prueba, valor, unidad e intervalo de referencia, los emparejamos entre laboratorios y los representamos a lo largo del tiempo, con explicaciones en lenguaje llano siempre identificadas como generadas por IA.',
  'landing.uploadFirst': 'Sube tu primer informe',
  'landing.assurance.private': 'Privado por defecto',
  'landing.assurance.redacted': 'Identificadores eliminados antes de la IA',
  'landing.assurance.export': 'Exporta o elimina cuando quieras',
  'landing.exampleReports': '7 informes · 2024-2026',
  'landing.chartAlt':
    'Gráfico de tendencia de ejemplo: la hemoglobina a lo largo de siete informes sobre un intervalo de referencia sombreado; baja por debajo del intervalo una vez, en noviembre de 2025, y vuelve a 14,2 g/dL en julio de 2026.',
  'landing.belowRange': '11,8 · por debajo del intervalo',
  'landing.illustrative':
    'Ejemplo ilustrativo. Los intervalos de referencia mostrados son los impresos en cada informe.',
  'landing.howItWorks': 'Cómo funciona',
  'landing.step1Title': 'Sube el PDF',
  'landing.step1Body':
    'Arrastra un informe de cualquier laboratorio. El archivo original se guarda de forma privada y nunca recibe un enlace público.',
  'landing.step2Title': 'Extraemos todos los valores',
  'landing.step2Body':
    'Nombre de la prueba, valor, unidad y el intervalo de referencia impreso en ese informe, incluidas las páginas escaneadas, mediante OCR.',
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
};
