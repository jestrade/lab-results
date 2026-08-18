/**
 * English message catalog — the source of truth for the interface's copy.
 *
 * ── Why this file defines the key set ─────────────────────────────────────
 *
 * `MessageKey` is derived from `typeof en`, and `es.ts` is typed as a complete
 * `Messages` record. That makes the compiler, rather than a review, the thing
 * that notices a missing Spanish string: adding a key here without adding it
 * there fails `tsc`. It also means a key that no longer exists in English
 * cannot linger in Spanish pretending to be used.
 *
 * There is no runtime fallback to English for a missing key, because there can
 * never be one — the type says so. What *does* fall back is catalog content
 * (variable names, descriptions), which lives in Firestore and is genuinely
 * allowed to be untranslated; see `@/domain/locales`.
 *
 * ── Conventions ───────────────────────────────────────────────────────────
 *
 * Keys are `area.thing`, lower camel after the dot. A message is one whole
 * sentence or one whole label; anything embedded in it — a name, a count, a
 * link — is a `{placeholder}` so the translator controls word order. See
 * `format.ts` for why.
 */

export const en = {
  // ── Common ────────────────────────────────────────────────────────────
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.saving': 'Saving…',
  'common.saved': 'Saved',
  'common.close': 'Close',
  'common.loading': 'Loading…',
  'common.retry': 'Try again',
  'common.back': 'Back',
  'common.signOut': 'Sign out',
  'common.signIn': 'Sign in',
  'common.createAccount': 'Create free account',
  'common.skipToContent': 'Skip to content',
  'common.dismissNotification': 'Dismiss notification',
  'common.verified': 'Verified',
  'common.unverified': 'Unverified',
  'common.brandTagline': 'Result archive & trends',
  'common.somethingWentWrong': 'Something went wrong',
  'common.unexpectedError': 'An unexpected error occurred. Reloading the page usually helps.',
  'common.reload': 'Reload the page',
  'common.uploadReport': 'Upload a report',

  // ── Language ──────────────────────────────────────────────────────────
  'lang.heading': 'Language',
  'lang.label': 'Interface language',
  'lang.description':
    'Changes the language of the application and, where a translation exists, of the laboratory variable names and explanations.',
  'lang.catalogNote':
    'Some variable explanations are only written in English so far. Those stay in English rather than being shown blank.',
  'lang.switcherLabel': 'Language',
  'lang.saveFailed': 'Your language was changed, but saving it to your profile failed.',

  // ── Appearance ────────────────────────────────────────────────────────
  'theme.heading': 'Appearance',
  'theme.label': 'Theme',
  'theme.description':
    'Applies across your account, on every device you sign in from. Laboratory results keep the same colours for each status in both themes.',
  'theme.system': 'Device setting',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  // Two whole sentences rather than one with a `{theme}` hole: filling that
  // hole would mean lowercasing a translated label, and which words take a
  // lowercase mid-sentence is a per-language decision, not a string operation.
  'theme.followingSystemLight': 'Following your device, which is currently set to light.',
  'theme.followingSystemDark': 'Following your device, which is currently set to dark.',
  'theme.saveFailed': 'Your theme was changed, but saving it to your profile failed.',

  // ── Navigation ────────────────────────────────────────────────────────
  'nav.upload': 'Upload report',
  'nav.files': 'Files',
  'nav.variables': 'Home',
  'nav.account': 'Account',
  'nav.profile': 'Profile',
  'nav.settings': 'Account settings',
  'nav.administration': 'Administration',
  'nav.adminOverview': 'Admin overview',
  'nav.adminUsers': 'Users',
  'nav.adminVariables': 'Variable catalog',
  'nav.adminJobs': 'Processing jobs',
  'nav.main': 'Main',
  'nav.navigation': 'Navigation',
  'nav.closeNavigation': 'Close navigation',

  // ── Public layout ─────────────────────────────────────────────────────
  'public.howItWorks': 'How it works',
  'public.privacy': 'Privacy',
  'public.disclaimer': 'Disclaimer',
  'public.legal.privacy': 'Privacy Policy',
  'public.legal.terms': 'Terms of Service',
  'public.legal.medicalDisclaimer': 'Medical Disclaimer',
  'public.legal.aiProcessing': 'AI Processing Disclosure',
  'public.legal.dataRetention': 'Data Retention',

  // ── Auth layout ───────────────────────────────────────────────────────
  'authLayout.foot':
    'Informational and educational only. Not a medical device, and not a substitute for consultation with a qualified healthcare professional.',

  // ── Shared components ─────────────────────────────────────────────────
  'error.notConfigured': 'The app is not configured',
  'error.pageFailed':
    'The page could not be displayed. The problem has been reported. Reloading usually helps — if it does not, contact support.',
  'disclaimer.bannerLabel': 'Medical disclaimer',
  'disclaimer.whatThisIsNot': 'What this is not',
  'disclaimer.readFull': 'Read the full disclaimer',
  'dropzone.release': 'Release to upload',
  'dropzone.unavailable': 'Uploading is not available yet',
  'dropzone.prompt': 'Drag your laboratory PDFs here',
  'dropzone.hint': 'or choose files from your computer — PDF only, up to 25 MB each',
  'password.show': 'Show password',
  'password.hide': 'Hide password',
  'google.waiting': 'Waiting for Google…',
  'quota.used': '{label}: {percent}% used',
  'quota.ofTotal': '{used} of {total}',
  'quota.full': 'Full. Delete a report you no longer need to free space.',
  'quota.remaining': '{amount} remaining',
  'skeleton.loadingResults': 'Loading results',

  // ── Status tables (@/domain/status) ───────────────────────────────────
  // The label is the non-colour carrier for the status, so it exists in every
  // locale by construction; the description is what assistive tech announces.
  'status.result.normal': 'Normal',
  'status.result.normal.description': 'Within the reference range printed on this report.',
  'status.result.low': 'Low',
  'status.result.low.description': 'Below the reference range printed on this report.',
  'status.result.high': 'High',
  'status.result.high.description': 'Above the reference range printed on this report.',
  'status.result.critical': 'Critical',
  'status.result.critical.description':
    'Outside the critical thresholds stated by the laboratory. May require prompt medical attention.',
  'status.result.unknown': 'Unknown',
  'status.result.unknown.description':
    'No usable reference range was available on this report, so the value was not classified.',

  'status.report.uploaded': 'Uploaded',
  'status.report.uploaded.description':
    'The file is stored and waiting to enter the processing queue.',
  'status.report.queued': 'Queued',
  'status.report.queued.description': 'Waiting for a processing slot.',
  'status.report.processing': 'Processing',
  'status.report.processing.description': 'Results are being extracted from the report.',
  'status.report.processed': 'Processed',
  'status.report.processed.description': 'All results were extracted successfully.',
  'status.report.partiallyProcessed': 'Partially processed',
  'status.report.partiallyProcessed.description':
    'Most results were extracted; some values could not be read reliably.',
  'status.report.failed': 'Failed',
  'status.report.failed.description': 'The report could not be processed.',

  // Movement, never merit — the spec forbids implying a direction is good or
  // bad, and that constraint binds the translation as much as the original.
  'status.trend.increasing': 'Increasing',
  'status.trend.increasing.description': 'The value has risen across recent reports.',
  'status.trend.decreasing': 'Decreasing',
  'status.trend.decreasing.description': 'The value has fallen across recent reports.',
  'status.trend.stable': 'Stable',
  'status.trend.stable.description':
    'The value has not moved meaningfully across recent reports.',
  'status.trend.insufficient': 'Insufficient data',
  'status.trend.insufficient.description':
    'There are not enough measurements yet to describe a direction.',

  'status.confidence.high': 'High confidence',
  'status.confidence.high.description': 'This value was read clearly from the report.',
  'status.confidence.medium': 'Medium confidence',
  'status.confidence.medium.description':
    'This value was read with some uncertainty. Check it against the report.',
  'status.confidence.low': 'Low confidence',
  'status.confidence.low.description':
    'This value could not be read reliably. Check it against the original report before relying on it.',

  'range.general': 'general reference, not lab-specific',
  'range.unavailable': 'reference range unavailable',

  // ── Variable series (@/domain/variables) ──────────────────────────────
  'series.range': 'Range {range}',
  'series.rangeUnavailable': 'Reference range unavailable',
  'series.resultOne': '{count} result',
  'series.resultMany': '{count} results',
  'sparkline.tooFew': '{name}: not enough measurements to show a trend.',
  'sparkline.rose': '{name} rose from {from} to {to} across {count} measurements.',
  'sparkline.fell': '{name} fell from {from} to {to} across {count} measurements.',
  'sparkline.steady': '{name} changed little from {from} to {to} across {count} measurements.',

  // ── Not found / coming soon ───────────────────────────────────────────
  'notFound.title': 'That page does not exist',
  'notFound.body': 'The link may be out of date, or the page may have moved.',
  'notFound.back': 'Back to the start',
  'comingSoon.title': 'Not built yet',
  'comingSoon.body': '{description} This screen is built by {ticket}.',
  'comingSoon.adminOverviewBody':
    'System-wide metrics: users, reports, failures and average processing time.',
  'comingSoon.adminJobsBody':
    'Live and failed extraction jobs, with durations and retry controls.',

  // ── Account settings ──────────────────────────────────────────────────
  'settings.aiHeading': 'AI processing',
  'settings.agreed': 'Agreed',
  'settings.notAgreed': 'Not agreed',
  'settings.aiIntro':
    'To read a report we send its text to {provider}, a third-party AI provider. Identifiers we can detect — email addresses, phone numbers, record numbers, dates — are removed first.',
  'settings.aiFact.notAnonymised':
    'This is {emphasis}. Names written inside the document cannot be reliably removed automatically.',
  'settings.aiFact.notAnonymisedEmphasis': 'not full anonymisation',
  'settings.aiFact.freeTier':
    'On the free tier, Google’s terms permit submitted content to be used to improve their products.',
  'settings.aiFact.noPdf':
    'The original PDF is never sent — only text extracted from it, after redaction.',
  'settings.aiFact.calculated':
    'Whether a result is low, normal, high or critical is calculated from the range printed on your report, not decided by the AI.',
  'settings.fullDetail': 'Full detail in the {document}.',
  'settings.agreedOn': 'You agreed on {date}.',
  'settings.withdraw': 'Withdraw consent',
  'settings.blocked':
    'Reports cannot be processed until you agree. You can still upload nothing, and any reports already processed are unaffected.',
  'settings.agree': 'I understand and agree',
  'settings.withdrawTitle': 'Withdraw consent for AI processing?',
  'settings.keepIt': 'Keep it',
  'settings.withdrawing': 'Withdrawing…',
  'settings.withdrawBody1':
    'New reports will not be processed, and you will not be able to upload until you agree again. Nothing is sent to the AI provider from the moment you withdraw.',
  'settings.withdrawBody2':
    'Reports already processed keep their results. Withdrawing does not delete anything — to remove your data, {deleteLink}.',
  'settings.deleteAccountLink': 'delete your account',
  'settings.otherHeading': 'Notifications and data export',
  'settings.otherBody':
    'Not built yet — notifications are KAN-48, and data export is KAN-23 (spec §56). Your name, password and health context are on {profileLink}, and so is {deleteLink}.',
  'settings.profileLink': 'Profile',
  'settings.deletingAccount': 'deleting your account',

  // ── Reports list ──────────────────────────────────────────────────────
  'reports.loading': 'Loading',
  'reports.countOne': '{count} report',
  'reports.countMany': '{count} reports',
  'reports.resultsCount': '{count} results',
  'reports.filter.all': 'All',
  'reports.filterLabel': 'Filter reports by status',
  'reports.emptyTitle': 'No reports yet',
  'reports.emptyBody':
    'Upload your first laboratory PDF and we’ll extract the results, match reference ranges and start tracking each value over time.',
  'reports.uploadFirst': 'Upload your first report',
  'reports.col.reportDate': 'Report date',
  'reports.col.uploaded': 'Uploaded',
  'reports.col.file': 'Original file',
  'reports.col.status': 'Status',
  'reports.col.results': 'Results',
  'reports.col.outOfRange': 'Out of range',
  'reports.col.actions': 'Actions',
  'reports.uploadDateNote': 'upload date',
  'reports.retry': 'Retry',
  'reports.retrying': 'Retrying…',
  'reports.retryLabel': 'Retry processing for {file}',
  'reports.viewDetails': 'View details',
  'reports.viewDetailsLabel': 'View details for {file}',
  'reports.originalPdf': 'Original PDF',
  'reports.originalPdfLabel': 'Open the original PDF for {file}',
  'reports.delete': 'Delete',
  'reports.deleteLabel': 'Delete {file}',
  'reports.caption': 'Your laboratory reports',
  'reports.captionFiltered': 'Your laboratory reports, filtered to {status}',
  'reports.noMatchTitle': 'Nothing matches this filter',
  'reports.noMatchBody': 'No reports have that status right now.',
  'reports.duplicateTag': 'Possible duplicate',
  'reports.deleteTitle': 'Delete this report?',
  'reports.deletePermanently': 'Delete permanently',
  'reports.deleting': 'Deleting…',
  'reports.deleteBody':
    '{file} and every result extracted from it will be removed. This cannot be undone, and the values it contributed will disappear from your trends.',
  'reports.deleteFreed': '{size} of your storage will be freed.',
  'reports.loadFailed': 'We could not load your reports. Check your connection and try again.',
  'reports.openFailed': 'That file could not be opened. It may still be uploading.',
  'reports.retryFailedAgain': 'That report could not be processed this time either.',
  'reports.retrySucceeded': 'Processing finished. The results are ready.',
  'reports.deleted': 'Report deleted. {size} of your storage freed.',
  'reports.deleteFailed': 'That report could not be deleted. Please try again.',

  // ── Selecting several reports (KAN-43) ────────────────────────────────
  'reports.selectLabel': 'Select {file}',
  'reports.selectAllLabel': 'Select every report shown',
  'reports.selectedOne': '{count} report selected · {size}',
  'reports.selectedMany': '{count} reports selected · {size}',
  'reports.clearSelection': 'Clear selection',
  'reports.deleteSelected': 'Delete selected',
  'reports.deleteSelectedTitle': 'Delete {count} reports?',
  'reports.deleteSelectedConfirm': 'Delete {count} permanently',
  'reports.deleteSelectedBody':
    'These reports and their extracted results will be removed. This cannot be undone. Your tracked variables keep the values these reports contributed — clear those separately from the variables page.',
  'reports.deletedOne': '{count} report deleted. {size} of your storage freed.',
  'reports.deletedMany': '{count} reports deleted. {size} of your storage freed.',
  'reports.deleteSomeFailed':
    '{count} could not be deleted and are still selected. Try again.',
  'reports.retryFailed':
    'We could not restart processing for this report. Please try again in a few minutes.',
  'reports.failedRetryable': 'Processing failed. You can try again.',
  'reports.failedReupload': 'Processing failed. Try uploading the file again.',
  'reports.extracting': 'Extracting results…',
  'reports.pageOne': '{count} page',
  'reports.pageMany': '{count} pages',

  // ── File and quota refusals ───────────────────────────────────────────
  'fileError.empty': '{file} is empty. Nothing was uploaded.',
  'fileError.notPdf':
    '{file} isn\'t a PDF. Laboratory reports must be uploaded as a PDF file. Nothing was uploaded.',
  'fileError.tooLarge': '{file} is {size}, over the {limit} limit. Nothing was uploaded.',
  'quotaError.uploadsDisabled':
    'Uploads are paused while we work on capacity. Your existing reports are unaffected. Please try again later.',
  'quotaError.fileTooLarge':
    'That file is {size}, over the {limit} limit for a single report. Nothing was uploaded.',
  'quotaError.storageFull':
    'This report needs {needed} but you have {free} left of your {allowance}. Delete a report you no longer need, then try again. Nothing was uploaded.',
  'quotaError.uploadsExhausted':
    'You have used all {limit} uploads for this month. Your allowance resets on the 1st. Nothing was uploaded.',
  'quotaError.systemFull':
    'The service is at capacity and cannot accept new reports right now. Nothing was uploaded — please try again later or contact support.',

  'storageError.unauthorized':
    'The server refused this upload. This is usually a configuration problem on our side rather than anything wrong with your file — please contact support and quote the reference below. Nothing was stored.',
  'storageError.quotaExceeded':
    'There is no storage space available for this report. Delete a report you no longer need and try again. Nothing was stored.',
  'storageError.unauthenticated': 'Your session has expired. Sign in again and retry the upload.',
  'storageError.retryLimit':
    'The upload kept timing out. Check your connection and try again — nothing was stored.',
  'storageError.canceled': 'Upload cancelled. Nothing was stored.',
  'storageError.invalidChecksum':
    'The file changed while it was uploading. Try again without editing it — nothing was stored.',
  'storageError.wrongSize': 'The upload did not arrive intact. Please try again — nothing was stored.',
  'storageError.unknown':
    'The upload did not finish. Please try again, and contact support if it keeps happening. Nothing was stored.',
  'storageError.reference': '(reference: {code})',

  // ── Upload page ───────────────────────────────────────────────────────
  'upload.kicker': 'Step one',
  'upload.lede':
    'PDF only, up to {perFile} per report, within your {allowance} allowance. Your file is stored privately and processed on our servers — never sent directly from your browser to a third party.',
  'upload.allowanceLabel': 'Your storage allowance',
  'upload.storageUsed': 'Storage used',
  'upload.uploadsThisMonth': 'Uploads this month',
  'upload.uploadsDetail': '{used} of {limit} used · resets on the 1st',
  'upload.pausedTitle': 'Uploads are paused',
  'upload.pausedBody':
    'The service is at capacity, so new reports cannot be accepted right now. Your existing reports and results are unaffected.',
  'upload.storageFullTitle': 'Your storage is full',
  'upload.storageFullBody':
    'Delete a report you no longer need to free space. You are using {used} of {limit}.',
  'upload.storageLowTitle': 'You are running low on space',
  'upload.storageLowBody':
    '{remaining} left of {limit}. Deleting reports you no longer need will free space.',
  'upload.consentTitle': 'Before your first upload',
  'upload.consentBody1':
    'To read your report we send its contents to {provider}, a third-party AI provider. Identifiers we can detect — email addresses, phone numbers, record numbers, dates — are removed first, but this is not full anonymisation: {emphasis}.',
  'upload.consentEmphasis': 'names written in the document are not reliably removable',
  'upload.consentBody2':
    'On the free tier, Google’s terms permit submitted content to be used to improve their products. {link}.',
  'upload.consentLink': 'What is sent, in detail',
  'upload.verifyTitle': 'Verify your email before uploading',
  'upload.verifyBody':
    'Uploading a report needs a verified address. We sent a link when you created your account.',
  'upload.verifyAction': 'Verify my email',
  'upload.disabled.verify': 'Verify your email address first.',
  'upload.disabled.consent': 'Agree to AI processing before uploading.',
  'upload.disabled.capacity': 'The service is at capacity. Please try again later.',
  'upload.disabled.storageFull': 'Your storage is full. Delete a report to free space.',
  'upload.disabled.monthly': 'You have used all your uploads for this month.',
  'upload.cancelLabel': 'Cancel upload of {file}',
  'upload.removeLabel': 'Remove {file} from the list',
  'upload.progressLabel': 'Uploading {file}',
  'upload.storedTitle': 'Report stored',
  'upload.storedTitleMany': '{count} reports stored',
  'upload.storedBody':
    '{file} was uploaded successfully. You can leave this page — processing continues and your report appears under Reports when it finishes.',
  'upload.storedBodyMany':
    'All {count} reports were uploaded successfully. You can leave this page — processing continues and they appear under Reports as each one finishes.',
  'upload.goToFiles': 'Go to files',
  'upload.uploaded': 'Report uploaded. Processing starts automatically.',
  'upload.cancelled': 'Upload cancelled.',
  'upload.queueHeading': 'Your files',
  'upload.queueLabel': 'Files chosen for upload',
  'upload.queueCount': '{done} of {total} uploaded',
  'upload.clearFinished': 'Clear finished',
  'upload.state.checking': 'Checking whether this report is already in your account…',
  'upload.state.confirming': 'Waiting for your answer.',
  'upload.state.waiting': 'Waiting its turn — files upload one at a time.',
  'upload.state.uploading': 'Uploading.',
  'upload.state.stored': 'Uploaded. Processing starts automatically.',
  'upload.state.skipped': 'Not uploaded — you chose to keep the copy you already have ({file}).',
  'upload.state.cancelled': 'Cancelled. Nothing was kept.',
  'upload.duplicateTitle': 'This report may already exist',
  'upload.duplicateBody': '{file} looks like a report that is already in your account.',
  'upload.duplicateIdentical':
    'It is the same file, byte for byte, as the report below.',
  'upload.duplicateSimilar':
    'It has the same name and size as the report below, which usually means the same file downloaded twice.',
  'upload.duplicateQuestion': 'Would you like to continue uploading it?',
  'upload.duplicateContinue': 'Upload it anyway',
  'upload.duplicateSkip': 'Do not upload it',
  'upload.statusHeading': 'Processing status',
  'upload.statusLabel': 'Report processing progress',
  'upload.statusFoot':
    'You can leave this page — processing continues and your report appears under Reports when it finishes.',
  'upload.step.stored': '{size} stored',
  'upload.step.transferring': '{count} still to go',
  'upload.step.chooseFile': 'Choose a PDF to begin',
  'upload.step.waitingSlot': 'Waiting for a processing slot',
  'upload.step.extracting': 'Extracting results',
  'upload.step.ready': 'Results and explanations ready',

  // ── Report details ────────────────────────────────────────────────────
  'detail.loadFailed': 'We could not load this report. It may have been deleted.',
  'detail.resultsLoadFailed': 'We could not load the results for this report.',
  'detail.openFailed': 'That file could not be opened.',
  'detail.missingTitle': 'That report does not exist',
  'detail.missingBody': 'It may have been deleted, or the link may be wrong.',
  'detail.backToFiles': 'Back to files',
  'detail.reprocessing': 'Reprocessing…',
  'detail.tryAgain': 'Try processing again',
  'detail.reportOf': 'Report of {date}',
  'detail.downloadOriginal': 'Download original',
  'detail.criticalOne': '{count} result outside the critical range',
  'detail.criticalMany': '{count} results outside the critical range',
  'detail.partialTitle': 'Some values could not be read',
  'detail.failedTitle': 'This report could not be processed',
  'detail.failedFallback': 'Something went wrong while processing this report.',
  'detail.processingTitle': 'Still processing',
  'detail.processingBody':
    'Results appear here as soon as extraction finishes. You can leave this page.',
  'detail.extractedResults': 'Extracted results',
  'detail.summaryOne': '{count} result',
  'detail.summaryMany': '{count} results',
  'detail.summaryOutOfRange': '{count} outside range',
  'detail.summaryLowConfidence': '{count} low confidence',
  'detail.noResultsTitle': 'No results yet',
  'detail.stillExtracting': 'Extraction is still running.',
  'detail.nothingExtracted': 'Nothing was extracted from this report.',
  'detail.tableCaption': 'Results extracted from {file}',
  'detail.col.test': 'Test',
  'detail.col.value': 'Value',
  'detail.col.unit': 'Unit',
  'detail.col.range': 'Reference range',
  'detail.col.status': 'Status',
  'detail.notStated': 'Not stated',
  'detail.aiGenerated': 'AI-generated · not medical advice',
  'detail.promptVersion': '{model} · prompt {version}',
  'detail.duplicateTitle': 'This looks like a report you already have',
  'detail.duplicateBody':
    'Another report in your account has the same date, laboratory or results. Both have been kept — nothing was removed or merged. Compare them and delete whichever you do not want.',
  'detail.duplicateCompare': 'Open the other report',
  'detail.metaLabel': 'Report metadata',
  'detail.meta.laboratory': 'Laboratory',
  'detail.meta.notStated': 'Not stated on this report',
  'detail.meta.reportDate': 'Report date',
  'detail.meta.uploaded': 'Uploaded',
  'detail.meta.processed': 'Processed',
  'detail.meta.file': 'File',
  'detail.meta.fileValue': '{name} · {size}',
  'detail.meta.privateLink':
    'The original file is served through an authenticated link. It is never given a public URL.',

  // ── Variables ─────────────────────────────────────────────────────────
  'variables.loadFailed': 'We could not load your variables. Check your connection and try again.',
  'variables.trackedOne': '{count} variable tracked',
  'variables.trackedMany': '{count} variables tracked',
  'variables.search': 'Search',
  'variables.searchPlaceholder': 'Search a test or alias',
  'variables.loadingLabel': 'Loading variables',
  'variables.emptyTitle': 'No variables tracked yet',
  'variables.emptyBody':
    'Once a report has been processed, every test on it appears here with its latest value and how it has moved over time.',
  'variables.filterCategory': 'Filter by category',
  'variables.allCategories': 'All categories',
  'variables.outOfRangeOnly': 'Outside range only ({count})',
  'variables.sortBy': 'Order',
  'variables.sort.category': 'By panel',
  'variables.sort.recent': 'Most recent first',
  'variables.sort.flagged': 'Outside range first',
  'variables.noMatchTitle': 'Nothing matches',
  'variables.noMatchBody': 'No tracked variable matches those filters.',
  'variables.groupCountOne': '{count} variable',
  'variables.groupCountMany': '{count} variables',
  'variables.showing': 'Showing {visible} of {total} variables.',
  'variables.cardLabel': '{name}, {value}',
  'variables.clearIntro':
    'The values on this page are kept as a history per test, built from every report that has been processed. Deleting a report removes the file, not its contribution to that history — this removes the history itself.',
  'variables.clearButton': 'Clear variable data',
  'variables.clearTitle': 'Clear all variable data?',
  'variables.clearBody':
    'This removes all {count} tracked variables and every measurement behind them. {emphasis}',
  'variables.clearBodyEmphasis': 'It cannot be undone.',
  'variables.clearKeeps':
    'Your reports and the results on each of them are left untouched. This page refills as new reports are processed.',
  'variables.clearCancel': 'Keep it',
  'variables.clearConfirm': 'Clear everything',
  'variables.clearing': 'Clearing…',
  'variables.clearedOne': '{count} variable cleared.',
  'variables.clearedMany': '{count} variables cleared.',
  'variables.clearFailed': 'Your variable data could not be cleared. Please try again.',

  // ── History chart (on the variable page) ──────────────────────────────
  'period.label': 'Period',
  'period.12m': 'Last 12 months',
  'period.3y': 'Last 3 years',
  'period.all': 'All time',
  'variable.chartNote':
    'The chart keeps this test\u2019s own scale and the reference range printed on each report, so the values stay the ones your laboratory reported. A direction describes movement over time — it is not a judgement about your health.',
  'variable.tooFewOne':
    '{count} measurement so far. A direction needs at least {min}, so none is shown — the measurements themselves are still plotted.',
  'variable.tooFewMany':
    '{count} measurements so far. A direction needs at least {min}, so none is shown — the measurements themselves are still plotted.',

  // ── Trend chart ───────────────────────────────────────────────────────
  'chart.noMeasurements': 'No measurements in this period.',
  // The chart's text alternative. It carries the same numbers a sighted reader
  // gets, so it is one sentence rather than fragments joined with a comma.
  'chart.summaryOne':
    '{name}: {count} measurement from {firstDate} to {lastDate}, {firstValue} to {lastValue}. Reference range {range}.',
  'chart.summaryMany':
    '{name}: {count} measurements from {firstDate} to {lastDate}, {firstValue} to {lastValue}. Reference range {range}.',
  'chart.rangeNotStated': 'not stated on the report',

  // ── Variable details (KAN-14 / KAN-46) ────────────────────────────────
  'variable.loadFailed': 'We could not load this variable. Check your connection and try again.',
  'variable.historyFailed':
    'We could not read the measurements behind this variable. What is shown above still comes from your reports; the history below is incomplete.',
  'variable.missingTitle': 'Nothing tracked for this test',
  'variable.missingBody':
    'The link may be out of date, or this variable may have been cleared. Upload a report that includes this test and it will appear here.',
  'variable.backToVariables': 'Back to variables',
  'variable.currentHeading': 'Latest result',
  'variable.lastMeasured': 'Measured {date}',
  'variable.categoryLabel': 'Panel',
  'variable.measuredLabel': 'History',
  'variable.measuredOne': '{count} measurement',
  'variable.measuredMany': '{count} measurements',
  'variable.historyHeading': 'Over time',
  // The chart in a sentence. Movement only — "up" and "down" describe the
  // numbers, and nothing here may suggest that either direction is welcome.
  'variable.changeNone': 'No measurements of {name} yet.',
  'variable.changeFirst':
    'Latest {name}: {value}. It is the first measurement, so there is nothing yet to compare it with.',
  'variable.changeUp': 'Latest {name}: {value}, up from {previous} at the measurement before it.',
  'variable.changeDown':
    'Latest {name}: {value}, down from {previous} at the measurement before it.',
  'variable.changeSame':
    'Latest {name}: {value}, unchanged from {previous} at the measurement before it.',
  'variable.showRange': 'Reference range',
  'variable.noNumeric':
    'None of these results is a number, so there is nothing to plot. They are listed below as the laboratory wrote them.',
  'variable.historyTruncated':
    'Assembled from your {count} most recent processed reports. Anything older is not included here.',
  'variable.qualitativeHeading': 'Reported values',
  'variable.qualitativeBody':
    'These results were not numbers. They are shown exactly as the laboratory wrote them, because turning "Negative" into a number would state something the report never did.',
  'variable.explanationHeading': 'What this test measures',
  'variable.explanationMissing': 'No explanation has been written for this test yet.',
  'variable.explanationUnreviewed':
    'Written automatically from the name printed on a report, and not reviewed by a person.',
  'variable.aliases': 'Also printed as {names}',
  'variable.analysisHeading': 'Analysis of your latest result',
  'variable.analysisOf': 'Written for the result of {date}',
  'variable.analysisMissing':
    'No analysis has been generated for this test. Analysis is written only for results outside their reference range, and only if you have agreed to AI processing.',
  'variable.tableHeading': 'Every measurement',
  'variable.tableEmpty': 'No measurements of this test were found on your reports.',
  'variable.tableCaption': 'Every measurement of {name} across your reports',
  'variable.col.date': 'Date',
  'variable.col.report': 'Report',
  'variable.openReport': 'Open report',

  // ── Interactive variable chart ────────────────────────────────────────
  'variableChart.pointLabel':
    '{name} on {date}: {value}, {status}. Activate to see the report it came from.',
  'variableChart.zoomHint':
    'Drag across the chart to narrow the period. The period buttons above do the same without a pointer.',
  'variableChart.resetZoom': 'Reset zoom',
  'variableChart.openReport': 'Open report',
  'variableChart.rangeOnReport': 'Range on this report {range}',
  'variableChart.noRangeOnReport': 'This report stated no reference range',

  // ── Auth errors (@/auth/authErrors) ───────────────────────────────────
  // Note that invalid-credential, wrong-password and user-not-found all map
  // here on purpose: telling them apart would be an account-enumeration
  // oracle, and that has to stay true in translation.
  'authError.invalidCredential':
    'That email and password don\'t match. Check them and try again, or reset your password.',
  'authError.invalidEmail': 'That doesn\'t look like an email address. Check it and try again.',
  'authError.userDisabled':
    'This account has been disabled. Contact support if you think this is a mistake.',
  'authError.emailInUse':
    'An account already exists for this email address. Sign in instead, or reset your password if you have forgotten it.',
  'authError.differentCredential':
    'This email already has a password account. Sign in with your password once and we\'ll link your Google account to it.',
  'authError.credentialInUse':
    'That Google account is already linked to a different LabResults account.',
  'authError.weakPassword': 'That password is too easy to guess. Use at least 10 characters.',
  'authError.tooManyRequests':
    'Too many attempts from this device. Wait a few minutes before trying again, or reset your password.',
  'authError.network': 'We could not reach the server. Check your connection and try again.',
  'authError.popupClosed':
    'The Google sign-in window closed before finishing. Try again when you are ready.',
  'authError.popupBlocked':
    'Your browser blocked the Google sign-in window. Allow pop-ups for this site, or sign in with your email and password.',
  'authError.notAllowed':
    'That sign-in method is not enabled for this application. Please contact support.',
  'authError.unauthorizedDomain':
    'Sign-in is not permitted from this address. Please contact support.',
  'authError.storageBlocked':
    'Your browser is blocking the storage this sign-in needs. Allow cookies and site data for this site, or sign in with your email and password.',
  'authError.internal':
    'Sign-in could not be completed. Try again, or sign in with your email and password instead.',
  'authError.timeout': 'Sign-in took too long to respond. Please try again.',
  'authError.cancelled': 'Sign-in was cancelled before it finished. Try again when you are ready.',
  'authError.recentLogin': 'For your security, sign in again before making this change.',
  'authError.expiredCode': 'That link has expired. Request a new one and use it within an hour.',
  'authError.invalidCode':
    'That link is no longer valid — it may already have been used. Request a new one.',
  'authError.generic':
    'Something went wrong while signing you in. Please try again, and contact support if it keeps happening.',
  'authError.reference': '(reference: {code})',

  // ── Password strength ─────────────────────────────────────────────────
  'password.tooShort': 'Use at least {min} characters.',
  'password.advice0': 'At least {min} characters.',
  'password.advice1': 'Too short. Use at least {min} characters.',
  'password.advice2': 'At least {min} characters. Add a number or symbol to strengthen it.',
  'password.advice3': 'Good. Add a symbol to strengthen it further.',
  'password.advice4': 'Strong.',

  // ── Profile ───────────────────────────────────────────────────────────
  'profile.loadFailed': 'We could not load your profile. Check your connection and try again.',
  'profile.detailsHeading': 'Your details',
  'profile.displayName': 'Display name',
  'profile.nameEmpty': 'Your name cannot be empty.',
  'profile.emailAddress': 'Email address',
  'profile.emailHint':
    'Changing your email is not available yet — it needs a verified-change flow so an account cannot be moved to an address the owner does not control.',
  'profile.saveName': 'Save name',
  'profile.nameSaved': 'Name saved.',
  'profile.emailVerification': 'Email verification',
  'profile.notVerified': 'Not verified',
  'profile.resendVerification': 'Resend verification email',
  'profile.resent': 'Sent — check your inbox.',
  'profile.accountCreated': 'Account created',
  'profile.passwordHeading': 'Password',
  'profile.googleNoPassword':
    'You sign in with Google, so this account has no password here. Manage it in your {link}.',
  'profile.googleSettingsLink': 'Google account settings',
  'profile.passwordMismatch': 'The two new passwords do not match.',
  'profile.passwordIntro':
    'Your current password is required. Without it, anyone who found this session open could lock you out of your own records.',
  'profile.passwordChanged': 'Your password has been changed.',
  'profile.currentPassword': 'Current password',
  'profile.newPassword': 'New password',
  'profile.confirmPassword': 'Confirm new password',
  'profile.changing': 'Changing…',
  'profile.changePassword': 'Change password',
  'profile.contextHeading': 'About you',
  'profile.optional': 'Optional',
  'profile.contextIntro':
    'Reference ranges differ by age and sex, and knowing what you already take or live with makes an explanation more relevant. Every field here is optional, and leaving them all blank changes nothing about how your results are classified.',
  'profile.contextLimit':
    'Filling this in does not make the analysis a medical assessment. Nothing here is used to decide whether a result is normal — that is always calculated from the reference range printed on your own report.',
  'profile.contextUnusedEmphasis': 'Not yet used for analysis.',
  'profile.contextUnused':
    '{emphasis} This is stored on your account, but the AI analysis does not read it. Sending it would widen what leaves this app beyond what the AI processing consent currently describes, so that needs the consent text updated first.',
  'profile.saveFailed': 'We could not save this. Check your connection and try again.',
  'profile.removeFailed': 'We could not remove this. Check your connection and try again.',
  'profile.dateOfBirth': 'Date of birth',
  'profile.dateOfBirthHint': 'Used to work out your age when a report was taken.',
  'profile.biologicalSex': 'Biological sex',
  'profile.biologicalSexHint': 'Asked because many reference ranges differ by sex.',
  'profile.preferNotToSay': 'Prefer not to say',
  'profile.sex.female': 'Female',
  'profile.sex.male': 'Male',
  'profile.sex.intersex': 'Intersex',
  'profile.pregnancyStatus': 'Pregnancy status',
  'profile.pregnancy.not': 'Not pregnant',
  'profile.pregnancy.pregnant': 'Pregnant',
  'profile.pregnancy.postpartum': 'Postpartum',
  'profile.medications': 'Medications',
  'profile.medicationsHint': 'One per line. Written as you write them — never parsed.',
  'profile.conditions': 'Ongoing conditions',
  'profile.onePerLine': 'One per line.',
  'profile.symptoms': 'Ongoing symptoms',
  'profile.removeAll': 'Remove all of this',
  'profile.removeTitle': 'Remove everything in this section?',
  'profile.removing': 'Removing…',
  'profile.removeIt': 'Remove it',
  'profile.removeBody':
    'Your date of birth, sex, pregnancy status, medications, conditions and symptoms are deleted from your account. Your reports and results are not affected.',

  // ── Account deletion ──────────────────────────────────────────────────
  'profile.dataHeading': 'Your data',
  'profile.consentElsewhere': 'Privacy and AI-processing consent live on {link}.',
  'profile.exportEmphasis': 'Data export is not built yet',
  'profile.exportBody':
    '{emphasis} (KAN-23). Email us if you need a copy of your reports before deleting your account — deletion cannot be undone.',
  'profile.deleted.profile':
    'Your profile: name, email, and anything you filled in under “About you”.',
  'profile.deleted.reports': 'Every report you uploaded, including the original PDF files.',
  'profile.deleted.results':
    'Every value extracted from those reports, and the AI explanations of them.',
  'profile.deleted.variables': 'Your tracked variables and their history.',
  'profile.deleted.account': 'Your consent record and your sign-in itself.',
  'profile.deleteHeading': 'Delete your account',
  'profile.deleteIntro':
    'This removes your account and everything in it, permanently. Nothing is kept, and we cannot bring any of it back.',
  'profile.deleteButton': 'Delete my account',
  'profile.deleteTitle': 'Delete your account and all your data?',
  'profile.keepAccount': 'Keep my account',
  'profile.deleting': 'Deleting…',
  'profile.deleteEverything': 'Delete everything',
  'profile.deleteWarningEmphasis': 'This cannot be undone.',
  'profile.deleteWarning':
    '{emphasis} Your reports, your results, their history and your sign-in are erased from our database and our file storage. There is no backup we can restore you from.',
  'profile.yourPassword': 'Your password',
  'profile.yourPasswordHint':
    'Asked so that someone who finds this page open cannot delete your records.',
  'profile.googleReauth':
    'This account signs in with Google, so a Google window will open to confirm it is you before anything is deleted.',
  'profile.typeToConfirm': 'Type {word} to confirm',
  'profile.deletedToast': 'Your account and all of your data have been deleted.',
  'profile.deleteReauth': 'For your security, sign in again and then delete your account.',
  'profile.deleteExpired': 'Your session has expired. Sign in again and then delete your account.',
  'profile.deletePartial':
    'We could not finish deleting your account. Some of your data may already have been removed — try again, and the rest will be. Contact us if it keeps failing.',

  // ── Sign in ───────────────────────────────────────────────────────────
  'signIn.asideHeading': 'Your laboratory results, finally in one place.',
  'signIn.aside.uploadTitle': 'Upload a PDF',
  'signIn.aside.uploadBody':
    'Every test name, value, unit and reference range is extracted for you.',
  'signIn.aside.trackTitle': 'Watch each value over time',
  'signIn.aside.trackBody':
    'The same test from different laboratories, matched and charted together.',
  'signIn.aside.contextTitle': 'Plain-language context',
  'signIn.aside.contextBody': 'Explanations and analysis, always labelled as AI-generated.',
  'signIn.newHere': 'New here? {link}',
  'signIn.createAccountLink': 'Create an account',
  'signIn.continueWithGoogle': 'Continue with Google',
  'signIn.orEmail': 'or sign in with email',
  'signIn.email': 'Email address',
  'signIn.password': 'Password',
  'signIn.forgotPassword': 'Forgot password?',
  'signIn.keepSignedIn': 'Keep me signed in on this device',
  'signIn.signingIn': 'Signing in…',
  'signIn.legal': 'By signing in you agree to the {terms}, the {privacy} and the {ai}.',

  // ── Register ──────────────────────────────────────────────────────────
  'register.asideHeading': 'One account. Every panel you have ever had.',
  'register.asideLede':
    'Your reports and the values extracted from them are visible only to you. Files are stored privately and processed on our servers — the original PDF never gets a public link.',
  'register.heading': 'Create your account',
  'register.haveOne': 'Already have one? {link}',
  'register.signUpWithGoogle': 'Sign up with Google',
  'register.orEmail': 'or use your email',
  'register.fullName': 'Full name',
  'register.namePlaceholder': 'Miriam Okonkwo',
  'register.emailPlaceholder': 'you@example.com',
  'register.nameRequired': 'Enter the name you would like us to use.',
  'register.emailInvalid': 'Enter a valid email address.',
  'register.consentRequired':
    'Both confirmations are required before an account can be created.',
  'register.acceptTerms':
    'I have read the {terms}, {privacy} and {disclaimer}, and I understand this service does not provide medical advice.',
  'register.termsLink': 'Terms',
  'register.acceptAi':
    'I consent to my report contents being processed by a third-party AI provider to extract and explain results. {link}',
  'register.whatIsSent': 'What is sent',
  'register.creating': 'Creating your account…',
  'register.createAccount': 'Create account',
  'register.verificationNote':
    'We’ll send a verification link to your email before your first upload.',

  // ── Forgot password ───────────────────────────────────────────────────
  'forgot.kicker': 'Forgot password',
  'forgot.heading': 'Reset your password',
  'forgot.lede':
    'Enter the email you signed up with and we’ll send a link to set a new password.',
  'forgot.sending': 'Sending…',
  'forgot.sendLink': 'Send reset link',
  'forgot.backToSignIn': 'Back to sign in',
  'forgot.sentKicker': 'Link sent',
  'forgot.sentHeading': 'Check your email',
  'forgot.sentBody':
    'If an account exists for {email}, a reset link is on its way. The link expires in one hour.',
  'forgot.resendIn': 'Resend in 0:{seconds}',
  'forgot.resend': 'Resend link',
  'forgot.differentEmail': 'Use a different email',
  'forgot.noConfirm': 'We don’t confirm whether an address is registered.',

  // ── Verify email ──────────────────────────────────────────────────────
  'verify.asideHeading': 'One last step before your first upload.',
  'verify.kicker': 'Email verification',
  'verify.heading': 'Verify your email to upload',
  'verify.body':
    'We sent a link to {email}. You can look around until then, but uploading a report needs a verified address.',
  'verify.sent': 'Verification email sent. It may take a minute to arrive.',
  'verify.stillUnverified':
    'That address is still unverified. Open the link in the email, then try again.',
  'verify.resend': 'Resend verification email',
  'verify.checking': 'Checking…',
  'verify.continue': 'I have verified — continue',
  'verify.googleNote': 'Accounts created with Google are verified automatically — no email step.',
  'verify.lookAround': 'Look around first',

  // ── Landing ───────────────────────────────────────────────────────────
  'landing.badge': 'Educational tool · not medical advice',
  'landing.heading': 'Stop reading your lab results one PDF at a time.',
  'landing.lede':
    'Upload the reports you already have. Every test, value, unit and reference range is extracted, matched across laboratories and charted over time — with plain-language explanations that are always labelled as AI-generated.',
  'landing.uploadFirst': 'Upload your first report',
  'landing.assurance.private': 'Private by default',
  'landing.assurance.redacted': 'Identifiers redacted before AI',
  'landing.assurance.export': 'Export or delete any time',
  'landing.exampleReports': '7 reports · 2024–2026',
  'landing.chartAlt':
    'Example trend chart: hemoglobin across seven reports against a shaded reference range, dipping below the range once in November 2025 and returning to 14.2 g/dL by July 2026.',
  'landing.belowRange': '11.8 · below range',
  'landing.illustrative':
    'Illustrative example. Reference ranges shown are the ones printed on each report.',
  'landing.howItWorks': 'How it works',
  'landing.step1Title': 'Upload the PDF',
  'landing.step1Body':
    'Drag in a report from any laboratory. The original file is stored privately and never gets a public link.',
  'landing.step2Title': 'We extract every value',
  'landing.step2Body':
    'Test name, value, unit and the reference range printed on that report — including scanned pages, via OCR.',
  'landing.step3Title': 'Values are matched and classified',
  'landing.step3Body':
    'Hgb, Hb and Hemoglobin become one variable. Low, normal, high and critical are decided arithmetically, not by AI.',
  'landing.step4Title': 'You see the whole history',
  'landing.step4Body':
    'Charts per variable, plus explanations and a preliminary analysis, both clearly marked as AI-generated.',
  'landing.legalNote': 'Read the {privacy}, the {terms} and the {ai} before creating an account.',

  // ── Legal pages ───────────────────────────────────────────────────────
  'legal.lastUpdated': 'Last updated {date} · {readingTime}',
  'legal.notFound': 'That document does not exist',
  'legal.notFoundBody': 'Check the link, or start from the medical disclaimer.',
  'legal.backHome': 'Back to the start',
  'legal.pendingTitle': 'Not published yet',
  'legal.onThisPage': 'On this page',
  'legal.translationNote':
    'Only the English version of this document has legal force. Any other language is provided for convenience.',
  'legal.kicker': 'Legal',
  'legal.documents': 'Documents',
  'legal.navLabel': 'Legal documents',
  'legal.version': 'Version {version}',
  'legal.previousVersions': 'Previous versions available on request.',
  'legal.notPublishedTitle': 'This document has not been published yet',
  'legal.notPublishedBody':
    'The {title} is still being drafted and reviewed. Until it is published, the {disclaimer} is the document that governs how this application may be used. If you need this policy before creating an account, contact support and we will send you the current draft.',
  'legal.notYetPublished': 'not yet published',
  'legal.readingTime': 'reading time {time}',
  'legal.doc.dataRetention': 'Data Retention Policy',

  // ── Administration: variable catalog (KAN-49) ─────────────────────────
  'adminVariables.intro':
    'The canonical list of laboratory tests. Every reader sees these names and explanations, and the extraction pipeline matches printed names against them.',
  'adminVariables.countOne': '{count} variable',
  'adminVariables.countMany': '{count} variables',
  'adminVariables.search': 'Search the catalog',
  'adminVariables.searchPlaceholder': 'Name, alias or id',
  'adminVariables.loadingLabel': 'Loading the catalog',
  'adminVariables.loadFailed': 'The catalog could not be loaded.',
  'adminVariables.emptyTitle': 'The catalog is empty',
  'adminVariables.emptyBody':
    'Import the maintained spreadsheet, or add the first entry by hand.',
  'adminVariables.noMatchTitle': 'No variable matches',
  'adminVariables.noMatchBody': 'Clear a filter, or search for a different name.',
  'adminVariables.showing': 'Showing {visible} of {total}.',
  'adminVariables.filterCategory': 'Filter by panel',
  'adminVariables.allCategories': 'All panels',
  'adminVariables.filterOrigin': 'Filter by origin',
  'adminVariables.originAll': 'Any origin',
  'adminVariables.originCatalog': 'Curated',
  'adminVariables.originDiscovered': 'Discovered',
  'adminVariables.needsReview': 'Needs review ({count})',
  'adminVariables.tableCaption': 'Laboratory variables in the catalog',
  'adminVariables.columnName': 'Name',
  'adminVariables.columnId': 'Document id',
  'adminVariables.columnCategory': 'Panel',
  'adminVariables.columnUnit': 'Unit',
  'adminVariables.columnAliases': 'Aliases',
  'adminVariables.columnState': 'State',
  'adminVariables.columnActions': 'Actions',
  'adminVariables.noUnit': 'None',
  'adminVariables.noDescription': 'No explanation yet',
  'adminVariables.stateReviewed': 'Reviewed',
  'adminVariables.stateNeedsReview': 'Needs review',
  'adminVariables.new': 'New variable',
  'adminVariables.edit': 'Edit',
  'adminVariables.editLabel': 'Edit {name}',
  'adminVariables.delete': 'Delete',
  'adminVariables.deleteLabel': 'Delete {name}',
  'adminVariables.newTitle': 'New variable',
  'adminVariables.editTitle': 'Edit {name}',
  'adminVariables.fieldId': 'Document id',
  'adminVariables.fieldIdHint':
    'Lower case, digits and hyphens. Suggested from the English name; change it before saving if you need a different one.',
  'adminVariables.fieldIdFixed':
    'An id cannot be changed after the entry is created — results already point at it.',
  'adminVariables.fieldCanonicalName': 'Canonical name',
  'adminVariables.fieldCanonicalNameHint':
    'The English name the matcher compares printed names against.',
  'adminVariables.fieldName': 'Display name ({language})',
  'adminVariables.fieldDescription': 'Explanation ({language})',
  'adminVariables.fieldDescriptionHint':
    'Plain language, shown on the variable page. Leave empty rather than guessing.',
  'adminVariables.fieldAliases': 'Aliases',
  'adminVariables.fieldAliasesHint':
    'One per line — the spellings real reports print, in any language. Commas are kept.',
  'adminVariables.fieldCategory': 'Panel',
  'adminVariables.fieldUnit': 'Default unit',
  'adminVariables.fieldUnitHint':
    'Used when a report prints a value without one. A report’s own unit always wins.',
  'adminVariables.reviewNote':
    'Saving marks this entry as curated and reviewed, so the enrichment pass will not rewrite it.',
  'adminVariables.errorRequired': 'This field is required.',
  'adminVariables.errorInvalidId':
    'Use lower-case letters, digits and hyphens, starting with a letter or digit.',
  'adminVariables.errorIdTaken': 'Another variable already uses this id.',
  'adminVariables.duplicateWarning':
    'A name here matches {id}, which is already in the catalog. Two entries for one test split a reader’s history in half — check before saving.',
  'adminVariables.create': 'Create variable',
  'adminVariables.creating': 'Creating…',
  'adminVariables.created': '{name} was added to the catalog.',
  'adminVariables.updated': '{name} was updated.',
  'adminVariables.saveFailed': 'The variable could not be saved.',
  'adminVariables.existsFailed':
    'That id was taken while you were editing. Choose another one.',
  'adminVariables.deleteTitle': 'Delete {name}?',
  'adminVariables.deleteBody':
    'The catalog entry goes: this name, its translations and its explanation stop being shown to every reader.',
  'adminVariables.deleteKeeps':
    'No results are affected. Anyone tracking this test keeps their values and their history, headed with whatever their own laboratory printed.',
  'adminVariables.deleteReturns':
    'It can come back on its own: the next report printing this test finds no match, and the pipeline creates an unreviewed placeholder for it. Correcting an entry usually beats deleting it.',
  'adminVariables.deleteConfirm': 'Delete variable',
  'adminVariables.deleting': 'Deleting…',
  'adminVariables.deleted': '{name} was deleted from the catalog.',
  'adminVariables.deleteFailed': 'The variable could not be deleted.',

  // ── Administration: users (KAN-50) ────────────────────────────────────
  'adminUsers.intro':
    'Every account in the system. Roles and access are changed here; laboratory results are not readable from this screen.',
  'adminUsers.countOne': '{count} account',
  'adminUsers.countMany': '{count} accounts',
  'adminUsers.search': 'Search accounts',
  'adminUsers.searchPlaceholder': 'Email, name or user id',
  'adminUsers.loadingLabel': 'Loading accounts',
  'adminUsers.loadFailed': 'The accounts could not be loaded.',
  'adminUsers.emptyTitle': 'No accounts yet',
  'adminUsers.emptyBody': 'Accounts appear here as soon as somebody registers.',
  'adminUsers.noMatchTitle': 'No account matches',
  'adminUsers.noMatchBody': 'Clear a filter, or search for a different address.',
  'adminUsers.showing': 'Showing {visible} of {total}.',
  'adminUsers.filterRole': 'Filter by role',
  'adminUsers.roleAll': 'Any role',
  'adminUsers.roleUser': 'User',
  'adminUsers.roleAdmin': 'Admin',
  'adminUsers.filterStatus': 'Filter by access',
  'adminUsers.statusAll': 'Any access',
  'adminUsers.statusActive': 'Active',
  'adminUsers.statusDisabled': 'Disabled',
  'adminUsers.tableCaption': 'Accounts registered in the system',
  'adminUsers.columnAccount': 'Account',
  'adminUsers.columnRole': 'Role',
  'adminUsers.columnStatus': 'Access',
  'adminUsers.columnJoined': 'Registered',
  'adminUsers.columnActions': 'Actions',
  'adminUsers.noName': 'No name given',
  'adminUsers.you': 'You',
  'adminUsers.unknownDate': 'Unknown',
  'adminUsers.loadMore': 'Load more accounts',
  'adminUsers.limitNote':
    'Showing the {count} most recently registered accounts. Search covers the accounts loaded so far.',
  'adminUsers.changeRole': 'Change role',
  'adminUsers.changeRoleLabel': 'Change the role of {name}',
  'adminUsers.roleTitle': 'Change the role of {name}',
  'adminUsers.promoteBody':
    'An admin can read every account in the system, change roles, disable accounts and edit the variable catalog.',
  'adminUsers.demoteBody':
    'This account loses access to the administration screens and to every other account.',
  'adminUsers.roleClaimNote':
    'The change is written to the account’s token, and reaches their open sessions the next time it refreshes — within the hour, or immediately if they sign in again.',
  'adminUsers.promoteConfirm': 'Make admin',
  'adminUsers.demoteConfirm': 'Make user',
  'adminUsers.roleSaving': 'Saving…',
  'adminUsers.roleChanged': '{name} is now {role}.',
  'adminUsers.roleFailed': 'The role could not be changed.',
  'adminUsers.selfActions': 'You cannot change your own role or access.',
  'adminUsers.disable': 'Disable',
  'adminUsers.disableLabel': 'Disable {name}',
  'adminUsers.enable': 'Enable',
  'adminUsers.enableLabel': 'Re-enable {name}',
  'adminUsers.disableTitle': 'Disable {name}?',
  'adminUsers.disableBody':
    'They cannot sign in again until an admin re-enables the account, and no open session can renew itself.',
  'adminUsers.disableWindow':
    'A session that is open right now keeps reading its own data until its token expires — an hour at the outside. To end access immediately, delete the account instead.',
  'adminUsers.disableKeeps':
    'Nothing is deleted. Their reports, results and history stay exactly as they are, and come back untouched if the account is re-enabled.',
  'adminUsers.disableReason': 'Reason (optional)',
  'adminUsers.disableReasonHint':
    'Recorded in the audit log beside who did it and when. Not shown to the account holder.',
  'adminUsers.disableConfirm': 'Disable account',
  'adminUsers.disabling': 'Disabling…',
  'adminUsers.disabledToast': '{name} can no longer sign in.',
  'adminUsers.enableTitle': 'Re-enable {name}?',
  'adminUsers.enableBody':
    'They can sign in again immediately, and find their reports and history as they left them.',
  'adminUsers.enableConfirm': 'Re-enable account',
  'adminUsers.enabling': 'Re-enabling…',
  'adminUsers.enabledToast': '{name} can sign in again.',
  'adminUsers.accessFailed': 'The account’s access could not be changed.',


  // ── Administration: overview (KAN-18) ─────────────────────────────────
  'adminOverview.intro':
    'The state of the system as a whole. Counts and capacity only — no laboratory value and no account’s results appear on this screen.',
  'adminOverview.loadingLabel': 'Loading the system overview',
  'adminOverview.loadFailed': 'The overview could not be loaded.',
  'adminOverview.healthOk': 'Operating normally',
  'adminOverview.healthAttention': 'Needs attention',
  'adminOverview.healthBlocked': 'Uploads are switched off',
  'adminOverview.healthBlockedBody':
    'The project-wide kill switch is on, so no account can upload a report. It clears when storage is back under the ceiling.',
  'adminOverview.healthAttentionBody':
    'Nothing is blocked, but something below is asking to be looked at.',
  'adminOverview.healthOkBody': 'No failed reports, and storage is well inside its ceiling.',
  'adminOverview.accountsHeading': 'Accounts',
  'adminOverview.accountsTotal': 'Registered',
  'adminOverview.accountsAdmins': 'With admin access',
  'adminOverview.accountsDisabled': 'Disabled',
  'adminOverview.accountsLink': 'Manage accounts',
  'adminOverview.reportsHeading': 'Reports',
  'adminOverview.reportsTotal': 'Uploaded',
  'adminOverview.reportsProcessed': 'Processed',
  'adminOverview.reportsFailed': 'Failed',
  'adminOverview.reportsFailedNote':
    'Each failure is one person whose report never came back. {ticket} builds the retry queue.',
  'adminOverview.catalogHeading': 'Variable catalog',
  'adminOverview.catalogTotal': 'Entries',
  'adminOverview.catalogNeedsReview': 'Awaiting review',
  'adminOverview.catalogLink': 'Open the catalog',
  'adminOverview.storageHeading': 'Storage',
  'adminOverview.storageUsed': '{used} of {limit} used',
  'adminOverview.storageUploadsOn': 'Uploads accepted',
  'adminOverview.storageUploadsOff': 'Uploads refused',
  'adminOverview.auditHeading': 'Recent administrative actions',
  'adminOverview.auditEmpty': 'Nothing has been done yet.',
  'adminOverview.auditNote':
    'Written by the server, never by the browser. The full trail lives in the auditLogs collection.',
  'adminOverview.auditRoleChanged': 'Role changed',
  'adminOverview.auditUserDisabled': 'Account disabled',
  'adminOverview.auditUserEnabled': 'Account re-enabled',
  'adminOverview.auditAccountDeleted': 'Account deleted by its owner',
  'adminOverview.auditUnknown': 'Recorded action',
  'adminOverview.auditActor': 'by {actor}',
  'adminOverview.auditActorRedacted': 'by a deleted account',
  'adminOverview.auditTarget': 'on {target}',
  'adminOverview.auditNoTarget': 'no account named',
  'adminOverview.refresh': 'Refresh',
  'adminOverview.refreshing': 'Refreshing…',
  'common.admin': 'Admin',
  'common.adminAccessLabel': 'You have admin access',


  // ── Pagination ────────────────────────────────────────────────────────
  'pagination.showing': 'Showing {from}–{to} of {total}',
  'pagination.previous': 'Previous',
  'pagination.next': 'Next',
  'pagination.goToPage': 'Go to page {page}',
  'pagination.catalogPages': 'Catalog pages',
  'pagination.accountPages': 'Account pages',


  // ── Account menu ──────────────────────────────────────────────────────
  'account.menuLabel': 'Account menu — {email}',
  'account.signedInAs': 'Signed in as',
  'account.verifyEmail': 'Verify your email address',

} as const;
