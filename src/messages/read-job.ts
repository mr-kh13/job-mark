/**
 * Sent by the popup to the content script of the active tab to ask which job the tab shows. The
 * content script answers with a `CapturedJob`, or `null` if it shows none.
 */
export type ReadJobMessage = { type: 'read-job' };
