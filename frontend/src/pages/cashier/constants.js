/**
 * Shared constants for the cashier module.
 *
 * These lived in CashierPage.jsx, which broke Vite's fast refresh for that file:
 * a module that exports both a component and a plain value is treated as
 * mixed, so every edit reloaded the whole cashier screen instead of patching
 * the component. CashierHeader imports VIEWS, so the values are needed outside
 * the page — hence their own module rather than being inlined twice.
 */
export const VIEWS = { ORDER: 'order', HISTORY: 'history' };